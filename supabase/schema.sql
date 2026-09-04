-- ============================================================
-- DOS SITE — DATABASE SCHEMA (v3)
-- Board of Studies, MSSN Unilorin
-- Updated: 20 Aug 2026 — v3 changes from IT team review:
--   * Added Levels table + department_levels junction
--   * Added student_profiles / aspirant_profiles for onboarding
--   * Added jamb_subjects for aspirant-track content
--   * Courses now have semester, scope_type, level_id
--   * Quizzes split into 'topic' (practice) and 'course' (weekly, counts)
--   * Questions and content_items support both student & aspirant tracks
--   * Auth via Supabase Auth (UUID user IDs, no custom sessions table)
-- ============================================================

-- ---------- ROLES & USERS ----------

CREATE TABLE roles (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(20) NOT NULL UNIQUE  -- 'admin', 'teacher', 'student', 'aspirant'
);

-- Users are created via Supabase Auth. The id matches auth.users(id).
CREATE TABLE users (
    id              UUID PRIMARY KEY,            -- references auth.users(id)
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    full_name       VARCHAR(150) NOT NULL,
    identifier      VARCHAR(50) NOT NULL UNIQUE, -- Matric Number (student) or JAMB Reg Number (aspirant)
    identifier_type VARCHAR(20) NOT NULL,        -- 'matric_number' | 'jamb_reg_number' | 'staff_id'
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    is_active       BOOLEAN NOT NULL DEFAULT true
);

-- ---------- ACADEMIC STRUCTURE (Admin-declared) ----------
-- Admin declares Levels, Faculties, Departments, and the Courses
-- under each Department, before the platform is usable.

CREATE TABLE levels (
    id              SERIAL PRIMARY KEY,
    value           INTEGER NOT NULL UNIQUE       -- 100, 200, 300, 400, 500, 600
);

CREATE TABLE faculties (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL UNIQUE   -- e.g. 'Faculty of Science'
);

CREATE TABLE departments (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER NOT NULL REFERENCES faculties(id),
    name            VARCHAR(150) NOT NULL,
    UNIQUE (faculty_id, name)
);

-- Which Levels are active for a given Department (some departments
-- run to 400L, others to 500L/600L) — declared by Admin.
CREATE TABLE department_levels (
    department_id   INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    level_id        INTEGER NOT NULL REFERENCES levels(id),
    PRIMARY KEY (department_id, level_id)
);

-- ---------- ONBOARDING PROFILES ----------

-- One row per Student, capturing onboarding answers
CREATE TABLE student_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    department_id   INTEGER NOT NULL REFERENCES departments(id),
    level_id        INTEGER NOT NULL REFERENCES levels(id),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
    -- NOTE: no self-reported GPA/CGPA. CGPA is 100% platform-computed.
);

-- One row per Aspirant, capturing onboarding answers
CREATE TABLE aspirant_profiles (
    user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    aspiration_department_id INTEGER NOT NULL REFERENCES departments(id),
    updated_at              TIMESTAMP NOT NULL DEFAULT now()
    -- NOTE: no self-reported JAMB score. Post-UTME score is 100% platform-computed.
);

-- ---------- JAMB STRUCTURE (Aspirants) ----------
-- Aspirants are not tied to Unilorin's course catalogue — their quizzes
-- and resources are organized by JAMB subject instead.

CREATE TABLE jamb_subjects (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL           -- e.g. 'Physics', 'Use of English'
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
    code            VARCHAR(20) NOT NULL,           -- e.g. 'MAT 101'
    title           VARCHAR(200) NOT NULL,
    level_id        INTEGER NOT NULL REFERENCES levels(id),
    semester        VARCHAR(10) NOT NULL CHECK (semester IN ('harmattan', 'rain')),
    scope_type      VARCHAR(15) NOT NULL CHECK (scope_type IN ('department', 'faculty', 'general', 'interfaculty')),
    department_id   INTEGER REFERENCES departments(id),   -- required when scope_type = 'department'
    faculty_id      INTEGER REFERENCES faculties(id),     -- required when scope_type = 'faculty'
    CHECK (
        (scope_type = 'department' AND department_id IS NOT NULL AND faculty_id IS NULL) OR
        (scope_type = 'faculty' AND faculty_id IS NOT NULL AND department_id IS NULL) OR
        (scope_type IN ('general', 'interfaculty') AND department_id IS NULL AND faculty_id IS NULL)
    )
);

-- Only populated when courses.scope_type = 'interfaculty'.
CREATE TABLE course_faculties (
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id      INTEGER NOT NULL REFERENCES faculties(id),
    PRIMARY KEY (course_id, faculty_id)
);

-- Topics are syllabus units taught within a course (e.g. MAT 101 -> "Trigonometry").
-- Both Admin and Teacher can create them.
CREATE TABLE topics (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    created_by      UUID NOT NULL REFERENCES users(id),  -- admin or teacher
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- QUESTION BANK ----------

CREATE TABLE questions (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER REFERENCES courses(id),        -- set for Student-track questions
    jamb_subject_id INTEGER REFERENCES jamb_subjects(id),   -- set for Aspirant-track questions
    topic_id        INTEGER REFERENCES topics(id),          -- set when question belongs to a specific topic
    question_type   VARCHAR(20) NOT NULL CHECK (question_type IN ('fill_in_gap', 'options')),
    body_rich_text  TEXT NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (
        (course_id IS NOT NULL AND jamb_subject_id IS NULL) OR
        (course_id IS NULL AND jamb_subject_id IS NOT NULL)
    )
);

CREATE TABLE question_options (
    id              SERIAL PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text     TEXT NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT false,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE question_blanks (
    id              SERIAL PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    blank_index     INTEGER NOT NULL DEFAULT 1,
    accepted_answer VARCHAR(255) NOT NULL,
    case_sensitive  BOOLEAN NOT NULL DEFAULT false
);

-- ---------- QUIZZES ----------
-- Two distinct quiz types:
--   'topic'  -> tied to ONE topic (e.g. Trigonometry under MAT 101).
--               Practice only — does NOT feed CGPA, Post-UTME, or leaderboard.
--   'course' -> weekly quiz for a whole course, released every weekend.
--               This is the ONLY quiz type that counts for grading, CGPA,
--               Post-UTME, and leaderboard. Fixed 50-question format.

CREATE TABLE quizzes (
    id                      SERIAL PRIMARY KEY,
    title                   VARCHAR(200) NOT NULL,
    description             TEXT,
    instructions            TEXT,
    quiz_type               VARCHAR(10) NOT NULL CHECK (quiz_type IN ('topic', 'course')),
    course_id               INTEGER REFERENCES courses(id),        -- set for Student-track quizzes
    topic_id                INTEGER REFERENCES topics(id),          -- set only when quiz_type = 'topic'
    jamb_subject_id         INTEGER REFERENCES jamb_subjects(id),   -- set for Aspirant-track quizzes
    week_start              DATE,                                    -- set only when quiz_type = 'course'
    question_count          INTEGER NOT NULL DEFAULT 50,
    time_limit_minutes      INTEGER NOT NULL,
    pass_mark               INTEGER NOT NULL,
    allow_multiple_attempts BOOLEAN NOT NULL DEFAULT false,
    lose_focus_policy       VARCHAR(20) NOT NULL DEFAULT 'ignore'
                            CHECK (lose_focus_policy IN ('ignore', 'warn', 'auto_submit')),
    status                  VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_by              UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
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

CREATE TABLE quiz_attempts (
    id              SERIAL PRIMARY KEY,
    quiz_id         INTEGER NOT NULL REFERENCES quizzes(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    attempt_number  INTEGER NOT NULL DEFAULT 1,
    score           NUMERIC(6,2),
    started_at      TIMESTAMP NOT NULL DEFAULT now(),
    submitted_at    TIMESTAMP
);

CREATE TABLE attempt_answers (
    id                  SERIAL PRIMARY KEY,
    attempt_id          INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id         INTEGER NOT NULL REFERENCES questions(id),
    selected_option_id  INTEGER REFERENCES question_options(id),
    text_answer         VARCHAR(255),
    is_correct          BOOLEAN
);

-- ---------- PERFORMANCE TRACKING ----------

CREATE TABLE best_scores (
    user_id         UUID NOT NULL REFERENCES users(id),
    quiz_id         INTEGER NOT NULL REFERENCES quizzes(id),
    best_score      NUMERIC(6,2) NOT NULL,
    achieved_at     TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, quiz_id)
);

-- Platform-computed CGPA, derived ONLY from 'course'-type quiz best scores (Students).
CREATE TABLE cgpa_records (
    id              SERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    week_start      DATE NOT NULL,
    cgpa_value      NUMERIC(4,2) NOT NULL,
    UNIQUE (user_id, week_start)
);

-- Platform-computed Post-UTME score, derived ONLY from 'course'-type quiz best
-- scores on JAMB subjects (Aspirants). Converted to Unilorin 50-point standard.
CREATE TABLE post_utme_scores (
    id                  SERIAL PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id),
    week_start          DATE NOT NULL,
    raw_score           NUMERIC(6,2) NOT NULL,
    converted_score_50  NUMERIC(4,2) NOT NULL,
    UNIQUE (user_id, week_start)
);

-- ---------- CONTENT / RESOURCES (PDFs & Articles) ----------
-- Files stored in Supabase Storage, organized in folders:
--   Students:   /resources/{faculty}/{department}/{level}/{semester}/{course}/
--   Aspirants:  /resources/jamb/{subject}/

CREATE TABLE content_items (
    id                SERIAL PRIMARY KEY,
    type              VARCHAR(10) NOT NULL CHECK (type IN ('pdf', 'article')),
    title             VARCHAR(200) NOT NULL,
    body_or_file_url  TEXT NOT NULL,
    course_id         INTEGER REFERENCES courses(id),        -- set for Student-track resources
    jamb_subject_id   INTEGER REFERENCES jamb_subjects(id),   -- set for Aspirant-track resources
    uploaded_by       UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    CHECK (
        (course_id IS NOT NULL AND jamb_subject_id IS NULL) OR
        (course_id IS NULL AND jamb_subject_id IS NOT NULL)
    )
);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO roles (name) VALUES ('admin'), ('teacher'), ('student'), ('aspirant');
