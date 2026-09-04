// ---- Roles ----
export type UserRole = "admin" | "teacher" | "student" | "aspirant";

// ---- Users ----
export interface User {
  id: string;
  role_id: number;
  full_name: string;
  identifier: string;
  identifier_type: "matric_number" | "jamb_reg_number" | "staff_id";
  created_at: string;
  is_active: boolean;
}

// ---- Academic Structure (Admin-declared) ----

export interface Level {
  id: number;
  value: number; // 100, 200, 300, 400, 500, 600
}

export interface Faculty {
  id: number;
  name: string;
}

export interface Department {
  id: number;
  faculty_id: number;
  name: string;
}

export interface DepartmentLevel {
  department_id: number;
  level_id: number;
}

// ---- Onboarding Profiles ----

export interface StudentProfile {
  user_id: string;
  department_id: number;
  level_id: number;
  updated_at: string;
}

export interface AspirantProfile {
  user_id: string;
  aspiration_department_id: number;
  updated_at: string;
}

// ---- JAMB Structure (Aspirants) ----

export interface JambSubject {
  id: number;
  name: string; // e.g. 'Physics', 'Use of English'
}

// ---- Courses & Topics ----

export type CourseScopeType = "department" | "faculty" | "general" | "interfaculty";
export type Semester = "harmattan" | "rain";

export interface Course {
  id: number;
  code: string; // e.g. 'MAT 101'
  title: string;
  level_id: number;
  semester: Semester;
  scope_type: CourseScopeType;
  department_id: number | null; // required when scope_type = 'department'
  faculty_id: number | null; // required when scope_type = 'faculty'
}

export interface CourseFaculty {
  course_id: number;
  faculty_id: number;
}

export interface Topic {
  id: number;
  course_id: number;
  title: string;
  created_by: string;
  created_at: string;
}

// ---- Question Bank ----
export type QuestionType = "fill_in_gap" | "options";

export interface Question {
  id: number;
  course_id: number | null; // set for Student-track questions
  jamb_subject_id: number | null; // set for Aspirant-track questions
  topic_id: number | null; // set when question belongs to a specific topic
  question_type: QuestionType;
  body_rich_text: string;
  status: "draft" | "published";
  created_by: string;
  created_at: string;
}

export interface QuestionOption {
  id: number;
  question_id: number;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface QuestionBlank {
  id: number;
  question_id: number;
  blank_index: number;
  accepted_answer: string;
  case_sensitive: boolean;
}

// ---- Quizzes ----
export type QuizType = "topic" | "course";

export interface Quiz {
  id: number;
  title: string;
  description: string | null;
  instructions: string | null;
  quiz_type: QuizType;
  course_id: number | null; // set for Student-track quizzes
  topic_id: number | null; // set only when quiz_type = 'topic'
  jamb_subject_id: number | null; // set for Aspirant-track quizzes
  week_start: string | null; // set only when quiz_type = 'course'
  question_count: number;
  time_limit_minutes: number;
  pass_mark: number;
  allow_multiple_attempts: boolean;
  lose_focus_policy: "ignore" | "warn" | "auto_submit";
  status: "draft" | "published";
  created_by: string;
  created_at: string;
}

export interface QuizQuestion {
  quiz_id: number;
  question_id: number;
}

// ---- Attempts ----

export interface QuizAttempt {
  id: number;
  quiz_id: number;
  user_id: string;
  attempt_number: number;
  score: number | null;
  started_at: string;
  submitted_at: string | null;
}

export interface AttemptAnswer {
  id: number;
  attempt_id: number;
  question_id: number;
  selected_option_id: number | null;
  text_answer: string | null;
  is_correct: boolean | null;
}

// ---- Performance ----

export interface BestScore {
  user_id: string;
  quiz_id: number;
  best_score: number;
  achieved_at: string;
}

export interface CgpaRecord {
  id: number;
  user_id: string;
  week_start: string;
  cgpa_value: number;
}

export interface PostUtmeScore {
  id: number;
  user_id: string;
  week_start: string;
  raw_score: number;
  converted_score_50: number;
}

// ---- Content / Resources ----

export interface ContentItem {
  id: number;
  type: "pdf" | "article";
  title: string;
  body_or_file_url: string;
  course_id: number | null; // set for Student-track resources
  jamb_subject_id: number | null; // set for Aspirant-track resources
  uploaded_by: string;
  created_at: string;
}
