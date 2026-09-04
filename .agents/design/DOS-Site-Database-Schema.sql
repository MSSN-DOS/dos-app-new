-- ============================================================
-- DOS SITE — DATABASE SCHEMA (v4 — matches DESIGN.md exactly)
-- Board of Studies, MSSN Unilorin
-- ============================================================
-- Notes:
--   * Written in generic SQL (PostgreSQL-flavored). Adjust types
--     for MySQL/SQLite as needed.
--   * Login uses Matric Number (Students) / JAMB Registration
--     Number (Aspirants), not email — this does not fit Supabase
--     Auth or Firebase Auth cleanly (both assume email/phone/social
--     login), so authentication is handled directly in application
--     code: `password_hash` is checked in code, and `sessions`
--     stores issued tokens. Applies regardless of DB/storage provider.
--   * v4 changes from v3 (requirements alignment session, 2026-08-22):
--       - Added `quiz_attempts.released_at` — scores are held on
--         submission and only visible to the student/aspirant once
--         Admin explicitly releases them (per-quiz or bulk-by-week).
--         NULL = held. This is the mechanism behind the "release
--         scores immediately or on a delay" Admin permission.
--       - Added `semester_settings` — single-row table resolving the
--         "active semester." Auto mode reads a fixed calendar
--         (application-side config, not stored here); manual mode
--         reads `manual_override` directly. Both were open questions
--         as of v3 and are now resolved — see DESIGN.md §8.
--       - No other structural changes from v3.
--   * v3 changes from v2 (IT team review, 2026-08-19):
--       - Registration identifiers corrected: Student = Matric
--         Number, Aspirant = JAMB Registration Number (was reversed).
--       - Removed self-reported GPA/CGPA at onboarding — CGPA is
--         now 100% platform-computed from course-quiz performance.
--         For consistency, the self-reported JAMB score field is
--         also removed — Post-UTME score is now 100% platform-
--         computed the same way.
--       - Added Faculty layer above Department.
--       - Added Topics under Courses.
--       - Courses now support 4 scope types: department / faculty /
--         general / interfaculty.
--       - Quizzes split into two distinct types: `topic` (practice,
--         does not count) and `course` (weekly, IS what feeds CGPA /
--         Post-UTME / leaderboard).
--       - No credit-unit weighting — every course quiz is a fixed
--         50-question format, so CGPA/Post-UTME average course-quiz
--         scores equally (per Board decision, 2026-08-19).
-- ============================================================

-- ---------- ROLES & USERS ----------

CREATE TABLE roles (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(20) NOT NULL UNIQUE  -- 'admin', 'teacher', 'student', 'aspirant'
);

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    full_name       VARCHAR(150) NOT NULL,
    identifier      VARCHAR(50) NOT NULL UNIQUE,  -- Matric Number (student) or JAMB Reg Number (aspirant)
    identifier_type VARCHAR(20) NOT NULL,         -- 'matric_number' | 'jamb_reg_number' | 'staff_id'
    password_hash   VARCHAR(255) NOT NULL,        -- checked in application code, not by a provider's auth SDK
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    is_active       BOOLEAN NOT NULL DEFAULT true
);

-- Custom auth sessions (replaces provider-managed auth — see note above)
CREATE TABLE sessions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    expires_at      TIMESTAMP NOT NULL
);

-- ---------- ACADEMIC STRUCTURE (Admin-declared) ----------
-- Admin declares Levels, Faculties, Departments, and the Courses
-- under each Department, before the platform is usable. All of it
-- is entered manually via the Admin UI — no external Unilorin data
-- source is imported (resolved, DESIGN.md §2 items 8-9).

CREATE TABLE levels (
    id              SERIAL PRIMARY KEY,
    value           INTEGER NOT NULL UNIQUE   -- 100, 200, 300, 400, 500, 600
);

CREATE TABLE faculties (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL UNIQUE   -- e.g. 'Faculty of Science'
);

CREATE TABLE departments (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculties(id),
    name            VARCHAR(150) NOT NULL
);

-- Which Levels are active for a given Department (some departments
-- run to 400L, others to 500L/600L) — declared by Admin.
CREATE TABLE department_levels (
    department_id   INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    level_id        INTEGER NOT NULL REFERENCES levels(id),
    PRIMARY KEY (department_id, level_id)
);

-- One row per Student, capturing onboarding answers
CREATE TABLE student_profiles (
    user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    department_id   INTEGER NOT NULL REFERENCES departments(id),
    level_id        INTEGER NOT NULL REFERENCES levels(id),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
    -- NOTE: no self-reported GPA/CGPA field. CGPA is 100%
    -- platform-computed — see cgpa_records below.
);

-- ---------- COURSES & TOPICS ----------
-- scope_type controls who a course is visible to:
--   'department'   -> only students in `department_id`
--   'faculty'      -> all students in every department under `faculty_id`
--   'general'      -> all students, any department/faculty, university-wide
--   'interfaculty' -> students in the specific faculties listed in
--                     `course_faculties` (Admin manually picks 2+ faculties)
CREATE TABLE courses (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL,   -- e.g. 'MAT 101'
    title           VARCHAR(200) NOT NULL,
    level_id        INTEGER NOT NULL REFERENCES levels(id),
    semester        VARCHAR(10) NOT NULL CHECK (semester IN ('harmattan', 'rain')),
    scope_type      VARCHAR(15) NOT NULL CHECK (scope_type IN ('department', 'faculty', 'general', 'interfaculty')),
    department_id   INTEGER REFERENCES departments(id),  -- required only when scope_type = 'department'
    faculty_id      INTEGER REFERENCES faculties(id),     -- required only when scope_type = 'faculty'
    CHECK (
        (scope_type = 'department' AND department_id IS NOT NULL AND faculty_id IS NULL) OR
        (scope_type = 'faculty' AND faculty_id IS NOT NULL AND department_id IS NULL) OR
        (scope_type IN ('general', 'interfaculty') AND department_id IS NULL AND faculty_id IS NULL)
    )
);

-- Only populated when courses.scope_type = 'interfaculty'.
-- Admin manually picks each faculty that shares the course.
CREATE TABLE course_faculties (
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id      INTEGER NOT NULL REFERENCES faculties(id),
    PRIMARY KEY (course_id, faculty_id)
);

-- Topics are the syllabus units taught within a course (e.g. MAT 101 ->
-- "Trigonometry"). Both Admin and Teacher can create them.
CREATE TABLE topics (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    created_by      INTEGER NOT NULL REFERENCES users(id),  -- admin or teacher
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- JAMB STRUCTURE (Aspirants) ----------
-- Aspirants are not tied to Unilorin's course catalogue — their quizzes
-- and resources are organized by JAMB subject instead.

CREATE TABLE jamb_subjects (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL   -- e.g. 'Physics', 'Use of English'
);

-- One row per Aspirant, capturing onboarding answers
CREATE TABLE aspirant_profiles (
    user_id                   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    aspiration_department_id INTEGER NOT NULL REFERENCES departments(id),  -- informational only; not used for content scoping
    updated_at                TIMESTAMP NOT NULL DEFAULT now()
    -- NOTE: no self-reported JAMB score field, for consistency with
    -- Students above. Post-UTME score is 100% platform-computed —
    -- see post_utme_scores below.
);

-- ---------- QUESTION BANK ----------

CREATE TABLE questions (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER REFERENCES courses(id),        -- set for Student-track questions
    jamb_subject_id INTEGER REFERENCES jamb_subjects(id),   -- set for Aspirant-track questions
    topic_id        INTEGER REFERENCES topics(id),          -- set when the question belongs to a specific topic (topic quizzes only)
    question_type   VARCHAR(20) NOT NULL CHECK (question_type IN ('fill_in_gap', 'options')),
    body_rich_text  TEXT NOT NULL,          -- stores formatted text (bold/sub/superscript etc.)
    status          VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_by      INTEGER NOT NULL REFERENCES users(id),  -- admin or teacher
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (
        (course_id IS NOT NULL AND jamb_subject_id IS NULL) OR
        (course_id IS NULL AND jamb_subject_id IS NOT NULL)
    )
);

-- Used only when question_type = 'options'. Options are single-select:
-- exactly one row per question should have is_correct = true — enforced
-- in application code at question-save time (DESIGN.md §4), not by a
-- DB constraint, since Postgres can't easily express "exactly one true
-- per question_id" without a partial unique index on a computed column.
CREATE TABLE question_options (
    id              SERIAL PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text     TEXT NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT false,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Used only when question_type = 'fill_in_gap'. Grading is always
-- case-insensitive exact match (resolved, DESIGN.md §4) — the
-- case_sensitive column below is unused by the grading code path for
-- MVP but kept in the schema for future flexibility.
CREATE TABLE question_blanks (
    id              SERIAL PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    blank_index     INTEGER NOT NULL DEFAULT 1,   -- supports multiple blanks per question
    accepted_answer VARCHAR(255) NOT NULL,
    case_sensitive  BOOLEAN NOT NULL DEFAULT false  -- currently ignored by grading logic, see above
);

-- ---------- QUIZZES ----------
-- Two distinct quiz types (Board decision, 2026-08-19):
--   'topic'  -> tied to ONE topic within a course (e.g. Trigonometry
--               under MAT 101). Practice only — does NOT feed CGPA,
--               Post-UTME, or the leaderboard. Question count is
--               free-form, set by the Teacher (resolved, DESIGN.md §2).
--   'course' -> the weekly quiz for a whole course, released every
--               weekend (opens Saturday 00:00, closes Sunday 23:59 —
--               resolved, DESIGN.md §2), pooling that week's topics
--               together. This is the ONLY quiz type that counts for
--               grading, CGPA, Post-UTME, and the leaderboard. Always
--               a fixed 50-question format (no credit-unit weighting
--               needed).
-- Teachers publish both types directly — no Admin approval step
-- (resolved, DESIGN.md §2).
CREATE TABLE quizzes (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    instructions        TEXT,
    quiz_type           VARCHAR(10) NOT NULL CHECK (quiz_type IN ('topic', 'course')),
    course_id           INTEGER REFERENCES courses(id),        -- set for Student-track quizzes (both types)
    topic_id            INTEGER REFERENCES topics(id),          -- set only when quiz_type = 'topic'
    jamb_subject_id     INTEGER REFERENCES jamb_subjects(id),   -- set for Aspirant-track quizzes (both types)
    week_start          DATE,                                    -- set only when quiz_type = 'course' (weekend release date)
    question_count      INTEGER NOT NULL DEFAULT 50,             -- course quizzes are always 50 questions
    time_limit_minutes  INTEGER NOT NULL,
    pass_mark           INTEGER NOT NULL,
    allow_multiple_attempts BOOLEAN NOT NULL DEFAULT false,
    lose_focus_policy   VARCHAR(20) NOT NULL DEFAULT 'ignore',  -- 'ignore' | 'warn' | 'auto_submit'
    status              VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_by          INTEGER NOT NULL REFERENCES users(id),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (
        (course_id IS NOT NULL AND jamb_subject_id IS NULL) OR
        (course_id IS NULL AND jamb_subject_id IS NOT NULL)
    ),
    CHECK (
        (quiz_type = 'topic' AND topic_id IS NOT NULL AND week_start IS NULL) OR
        (quiz_type = 'course' AND topic_id IS NULL AND week_start IS NOT NULL)
    )
);

CREATE TABLE quiz_questions (
    quiz_id         INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES questions(id),
    PRIMARY KEY (quiz_id, question_id)
);

-- ---------- ATTEMPTS ----------

-- released_at added in v4 (resolved, DESIGN.md §4 "Score release"):
-- scores are HELD by default on submission and only shown to the
-- student/aspirant once Admin explicitly releases them, either
-- per-quiz or in bulk for a given week. NULL = held. The API layer
-- must not include `score` in any response to a Student/Aspirant
-- for a row where released_at IS NULL — enforce this server-side,
-- not just by hiding it in the UI (see AGENTS.md §3).
CREATE TABLE quiz_attempts (
    id              SERIAL PRIMARY KEY,
    quiz_id         INTEGER NOT NULL REFERENCES quizzes(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    attempt_number  INTEGER NOT NULL DEFAULT 1,
    score           NUMERIC(6,2),
    started_at      TIMESTAMP NOT NULL DEFAULT now(),
    submitted_at    TIMESTAMP,
    released_at     TIMESTAMP NULL   -- NEW in v4. NULL = held; set when Admin releases this attempt's score.
);

CREATE TABLE attempt_answers (
    id                  SERIAL PRIMARY KEY,
    attempt_id          INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id         INTEGER NOT NULL REFERENCES questions(id),
    selected_option_id  INTEGER REFERENCES question_options(id),  -- for 'options' type
    text_answer         VARCHAR(255),                              -- for 'fill_in_gap' type
    is_correct          BOOLEAN
);

-- ---------- PERFORMANCE TRACKING ----------

-- Best score per user per quiz (derived, but useful as a materialized record).
-- For topic quizzes this is practice feedback only; for course quizzes
-- this is the number that feeds CGPA / Post-UTME below. Note this table
-- is not itself gated by released_at — it's an internal record used by
-- Admin-facing views and the CGPA/Post-UTME calculators, which only run
-- over released weeks. Never expose best_scores directly to a Student/
-- Aspirant client without checking the corresponding attempt's
-- released_at first.
CREATE TABLE best_scores (
    user_id         INTEGER NOT NULL REFERENCES users(id),
    quiz_id         INTEGER NOT NULL REFERENCES quizzes(id),
    best_score      NUMERIC(6,2) NOT NULL,
    achieved_at     TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, quiz_id)
);

-- Platform-computed CGPA, derived ONLY from `course`-type quiz best
-- scores on RELEASED attempts (Students only). Simple average across
-- a student's course quizzes for the week — no credit-unit weighting
-- (Board decision: every course quiz is the same fixed 50-question
-- format). Recomputed at the moment Admin releases a week's scores,
-- not on a separate cron schedule (resolved, DESIGN.md §5).
CREATE TABLE cgpa_records (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    week_start      DATE NOT NULL,
    cgpa_value      NUMERIC(4,2) NOT NULL,
    UNIQUE (user_id, week_start)
);

-- Platform-computed Post-UTME score, derived ONLY from `course`-type
-- quiz best scores on JAMB subjects, on RELEASED attempts (Aspirants
-- only). Converted to Unilorin's 50-point standard. NOTE: the exact
-- conversion formula is implemented as a working placeholder
-- (raw / 2) pending final Board confirmation — see DESIGN.md §5 and
-- STATE.md. Do not treat converted_score_50 as final/authoritative
-- for a real launch until that's confirmed.
CREATE TABLE post_utme_scores (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    week_start          DATE NOT NULL,
    raw_score           NUMERIC(6,2) NOT NULL,
    converted_score_50  NUMERIC(4,2) NOT NULL,  -- Unilorin 50-point standard — formula pending Board confirmation
    UNIQUE (user_id, week_start)
);

-- ---------- SEMESTER SETTINGS ----------
-- NEW in v4 (resolved, DESIGN.md §8 "Active semester"). Single-row
-- table (id = 1) resolving which semester is "active" for scoping
-- what a Student sees. Auto mode reads a fixed 2025/26-session
-- calendar defined in application code (lib/semester/calendar.ts —
-- not stored in the DB, since it's a static yearly config, not user
-- data); manual mode reads manual_override directly, ignoring the
-- calendar. Manual mode exists as a safety net for when real
-- semester dates drift from what's hardcoded — Admin flips it from
-- /admin/settings/semester.
CREATE TABLE semester_settings (
    id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single-row table
    mode              VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'manual')),
    manual_override   VARCHAR(10) CHECK (manual_override IN ('harmattan', 'rain')),  -- only read when mode = 'manual'
    updated_at        TIMESTAMP NOT NULL DEFAULT now(),
    updated_by        INTEGER REFERENCES users(id)  -- admin who last changed this
);

-- ---------- CONTENT / RESOURCES (PDFs & Articles) ----------
-- Files themselves live in Supabase Storage, organized in folders
-- that mirror this structure:
--   Students:   /resources/{faculty}/{department}/{level}/{semester}/{course}/
--   Aspirants:  /resources/jamb/{subject}/
-- This table stores the metadata and the resulting file URL.
-- Admin-only — Teachers cannot upload (resolved, DESIGN.md §2 item 4).

CREATE TABLE content_items (
    id                SERIAL PRIMARY KEY,
    type              VARCHAR(10) NOT NULL CHECK (type IN ('pdf', 'article')),
    title             VARCHAR(200) NOT NULL,
    body_or_file_url  TEXT NOT NULL,
    course_id         INTEGER REFERENCES courses(id),        -- set for Student-track resources
    jamb_subject_id   INTEGER REFERENCES jamb_subjects(id),   -- set for Aspirant-track resources
    uploaded_by       INTEGER NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (
        (course_id IS NOT NULL AND jamb_subject_id IS NULL) OR
        (course_id IS NULL AND jamb_subject_id IS NOT NULL)
    )
);

-- ============================================================
-- Leaderboard is a derived view (admin-only in the app layer),
-- not a stored table. Only released weeks feed it — join on
-- cgpa_records/post_utme_scores, which are themselves only ever
-- written for released weeks (see notes above), so no extra
-- released_at filter is needed at this layer:
-- ============================================================
-- CREATE VIEW leaderboard AS
--   SELECT u.id, u.full_name, r.name AS role,
--          COALESCE(c.cgpa_value, p.converted_score_50) AS score
--   FROM users u
--   JOIN roles r ON r.id = u.role_id
--   LEFT JOIN cgpa_records c ON c.user_id = u.id AND c.week_start = <current_week>
--   LEFT JOIN post_utme_scores p ON p.user_id = u.id AND p.week_start = <current_week>
--   ORDER BY score DESC;
