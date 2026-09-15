-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clinical";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "comms";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "compliance";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "flow";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "integration";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "meds";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "people";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "core"."tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "logo_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."campuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "homeroom_user_id" UUID,
    "external_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."calendar_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SCHOOL_DAY',
    "description" TEXT,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."schedule_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacher_user_id" UUID,

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "person_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'es-CO',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "kiosk_device_code" TEXT,
    "kiosk_pin_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permissions" (
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "core"."role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "scope_section_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."teacher_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "subject" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "kiosk" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."mfa_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TOTP',
    "secret_enc" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."link_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "person_id" UUID,
    "user_id" UUID,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "email" CITEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "used_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'local',
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "scan_status" TEXT NOT NULL DEFAULT 'SKIPPED',
    "owner_person_id" UUID,
    "expires_on" DATE,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."scheduled_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "recipients" TEXT[],
    "params" JSONB NOT NULL DEFAULT '{}',
    "last_run_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "document_type" TEXT,
    "document_number" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE,
    "sex" TEXT,
    "email" CITEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "address" TEXT,
    "nationality" TEXT,
    "photo_key" TEXT,
    "photo_hash" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "inactive_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "current_group_id" UUID,
    "enrollment_status" TEXT,
    "shift" TEXT,
    "transport" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "inactive_reason" TEXT,
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."guardians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "occupation" TEXT,
    "company" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."student_guardians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "can_pick_up" BOOLEAN NOT NULL DEFAULT true,
    "legal_custody" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "restrictions" TEXT,
    "judicial_restriction" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "position" TEXT,
    "section_id" UUID,
    "is_teacher" BOOLEAN NOT NULL DEFAULT false,
    "is_first_responder" BOOLEAN NOT NULL DEFAULT false,
    "external_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "line1" TEXT NOT NULL,
    "neighborhood" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "can_pick_up" BOOLEAN NOT NULL DEFAULT false,
    "document_number" TEXT,
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people"."enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "group_id" UUID,
    "year_label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_on" DATE,
    "ended_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."health_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "blood_type" TEXT,
    "eps" TEXT,
    "prepaid_plan" TEXT,
    "accident_insurance" TEXT,
    "accident_policy_number" TEXT,
    "preferred_ips" TEXT,
    "physical_activity_restrictions" TEXT,
    "dietary_restrictions" TEXT,
    "general_notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completeness_pct" INTEGER NOT NULL DEFAULT 0,
    "last_guardian_update_at" TIMESTAMPTZ(6),
    "last_guardian_update_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "health_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."allergies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" TEXT NOT NULL,
    "requires_epinephrine" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "annulled_at" TIMESTAMPTZ(6),
    "annul_reason" TEXT,
    "annulled_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."chronic_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icd10_code" TEXT,
    "diagnosed_at" DATE,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "treating_physician" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "annulled_at" TIMESTAMPTZ(6),
    "annul_reason" TEXT,
    "annulled_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "chronic_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."care_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "condition_id" UUID,
    "title" TEXT NOT NULL,
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "symptoms" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "rescue_medications" JSONB NOT NULL DEFAULT '[]',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "review_date" DATE,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."immunizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "vaccine" TEXT NOT NULL,
    "dose_label" TEXT NOT NULL,
    "administered_on" DATE NOT NULL,
    "lot" TEXT,
    "provider" TEXT,
    "card_file_id" UUID,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "immunizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."home_medications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "home_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."activity_restrictions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "certificate_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "activity_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."surgical_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "surgical_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."disabilities_supports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "has_piar" BOOLEAN NOT NULL DEFAULT false,
    "supports" TEXT,
    "reasonable_adjustments" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "disabilities_supports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."anthropometrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "measured_at" DATE NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "height_cm" DOUBLE PRECISION NOT NULL,
    "head_circumference_cm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "bmi_z" DOUBLE PRECISION,
    "bmi_percentile" DOUBLE PRECISION,
    "height_z" DOUBLE PRECISION,
    "weight_z" DOUBLE PRECISION,
    "classification" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "anthropometrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."screenings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "performed_on" DATE NOT NULL,
    "result" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "referral" TEXT,
    "notes" TEXT,
    "campaign_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."health_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expires_on" DATE,
    "verified_at" TIMESTAMPTZ(6),
    "verified_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "health_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."encounters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL DEFAULT 'STUDENT',
    "student_id" UUID,
    "pass_id" UUID,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "chief_complaint" TEXT NOT NULL,
    "template_key" TEXT,
    "referred_by" TEXT,
    "referred_from" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "disposition" TEXT,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "physical_exam" JSONB NOT NULL DEFAULT '{}',
    "treatments" JSONB NOT NULL DEFAULT '[]',
    "rest_minutes" INTEGER,
    "parent_summary" TEXT,
    "is_mental_health" BOOLEAN NOT NULL DEFAULT false,
    "is_historical" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "external_id" TEXT,
    "historical_data" JSONB,
    "attended_by_user_id" UUID,
    "attended_by_name" TEXT,
    "signed_by_user_id" UUID,
    "signed_at" TIMESTAMPTZ(6),
    "seq" BIGINT,
    "hash" TEXT,
    "prev_hash" TEXT,
    "annulled_at" TIMESTAMPTZ(6),
    "annulled_by" UUID,
    "annul_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."vital_signs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "taken_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature_c" DOUBLE PRECISION,
    "heart_rate" INTEGER,
    "respiratory_rate" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "spo2" INTEGER,
    "glucose_mg_dl" INTEGER,
    "pain_score" INTEGER,
    "glasgow" INTEGER,
    "worst_level" TEXT,
    "taken_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."encounter_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "author_id" UUID,
    "hash" TEXT,
    "prev_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."encounter_diagnoses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "system" TEXT NOT NULL DEFAULT 'ICD10',
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."encounter_procedures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "item_id" UUID,
    "quantity" DOUBLE PRECISION,
    "stock_movement_id" UUID,
    "performed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."encounter_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "consent_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."observation_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "alerted_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "outcome" TEXT,
    "rechecked_by" UUID,

    CONSTRAINT "observation_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "departed_at" TIMESTAMPTZ(6),
    "companion" TEXT,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."incident_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "place" TEXT NOT NULL,
    "activity" TEXT,
    "mechanism" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MILD',
    "witnesses" JSONB NOT NULL DEFAULT '[]',
    "supervising_staff" TEXT,
    "insurance_notified" BOOLEAN NOT NULL DEFAULT false,
    "work_accident_report" BOOLEAN NOT NULL DEFAULT false,
    "preventive_actions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."mental_health_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "encounter_id" UUID,
    "note_enc" BYTEA NOT NULL,
    "risk_level" TEXT NOT NULL DEFAULT 'NONE',
    "referral" TEXT,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mental_health_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_access_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'READ',
    "reason" TEXT,
    "out_of_role" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."outbreak_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "scope_name" TEXT NOT NULL,
    "syndrome" TEXT NOT NULL,
    "cases" INTEGER NOT NULL,
    "population" INTEGER NOT NULL,
    "attack_rate_pct" DOUBLE PRECISION NOT NULL,
    "first_case_at" TIMESTAMPTZ(6) NOT NULL,
    "last_case_at" TIMESTAMPTZ(6) NOT NULL,
    "student_ids" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dedupe_key" TEXT NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "outbreak_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "description" TEXT,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."campaign_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "done_at" TIMESTAMPTZ(6),
    "recorded_by" UUID,

    CONSTRAINT "campaign_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."absence_excuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "illness" BOOLEAN NOT NULL DEFAULT true,
    "symptoms" TEXT,
    "attachment_file_id" UUID,
    "submitted_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "validated_by" UUID,
    "validated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_excuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."field_trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "destination" TEXT NOT NULL,
    "group_ids" TEXT[],
    "kit_id" UUID,
    "responsible_staff" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."emergency_drills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "protocol_key" TEXT NOT NULL,
    "performed_on" DATE NOT NULL,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER,
    "findings" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_drills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."safety_resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "details" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meds"."medication_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "generic_name" TEXT NOT NULL,
    "brand_names" TEXT[],
    "form" TEXT NOT NULL,
    "concentration" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "atc" TEXT,
    "otc_allowed" BOOLEAN NOT NULL DEFAULT false,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "requires_refrigeration" BOOLEAN NOT NULL DEFAULT false,
    "rescue" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meds"."medication_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "requested_by_user_id" UUID,
    "guardian_person_id" UUID,
    "catalog_id" UUID,
    "medication_name" TEXT NOT NULL,
    "active_ingredient" TEXT,
    "presentation" TEXT,
    "dose" DOUBLE PRECISION NOT NULL,
    "dose_unit" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "times" TEXT[],
    "days_of_week" INTEGER[],
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "indication" TEXT NOT NULL,
    "prescriber_name" TEXT,
    "prescriber_license" TEXT,
    "is_prn" BOOLEAN NOT NULL DEFAULT false,
    "prn_criteria" TEXT,
    "min_interval_minutes" INTEGER,
    "max_doses_per_day" INTEGER,
    "self_administration" BOOLEAN NOT NULL DEFAULT false,
    "storage" TEXT NOT NULL DEFAULT 'SHELF',
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_reason" TEXT,
    "review_checks" JSONB,
    "consent_id" UUID,
    "status_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medication_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meds"."prescriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "issued_on" DATE,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meds"."medication_custody" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "quantity_received" DOUBLE PRECISION NOT NULL,
    "quantity_remaining" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "expiry_date" DATE NOT NULL,
    "delivered_by" TEXT NOT NULL,
    "received_by_user_id" UUID NOT NULL,
    "storage" TEXT NOT NULL,
    "location_id" UUID,
    "packaging_intact" BOOLEAN NOT NULL,
    "labeled" BOOLEAN NOT NULL,
    "notes" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "close_action" TEXT,
    "close_quantity" DOUBLE PRECISION,
    "close_received_by" TEXT,
    "close_notes" TEXT,

    CONSTRAINT "medication_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meds"."medication_schedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "alerted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meds"."medication_administrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "schedule_id" UUID,
    "student_id" UUID NOT NULL,
    "custody_id" UUID,
    "encounter_id" UUID,
    "administered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "administered_by_user_id" UUID NOT NULL,
    "witness_user_id" UUID,
    "dose" DOUBLE PRECISION NOT NULL,
    "dose_unit" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "adverse_effects" TEXT,
    "verification" JSONB NOT NULL DEFAULT '{}',
    "self_administered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "seq" BIGINT,
    "hash" TEXT,
    "prev_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_administrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "presentation" TEXT,
    "concentration" TEXT,
    "unit" TEXT NOT NULL,
    "atc_code" TEXT,
    "requires_refrigeration" BOOLEAN NOT NULL DEFAULT false,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "min_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_stock" DOUBLE PRECISION,
    "unit_cost" DOUBLE PRECISION,
    "catalog_medication_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "campus_id" UUID,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "min_temp_c" DOUBLE PRECISION,
    "max_temp_c" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."item_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot" TEXT NOT NULL,
    "expiry_date" DATE,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_cost" DOUBLE PRECISION,
    "supplier_id" UUID,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_id" UUID,
    "location_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "encounter_id" UUID,
    "administration_id" UUID,
    "purchase_order_id" UUID,
    "performed_by_user_id" UUID NOT NULL,
    "second_signer_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" CITEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expected_on" DATE,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."kits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "location_description" TEXT NOT NULL,
    "section_id" UUID,
    "check_every_days" INTEGER NOT NULL DEFAULT 30,
    "items" JSONB NOT NULL DEFAULT '[]',
    "last_checked_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."kit_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kit_id" UUID NOT NULL,
    "checked_by_user_id" UUID NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "ok" BOOLEAN NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kit_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."fridge_temperature_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "temperature_c" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID,
    "out_of_range" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "fridge_temperature_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow"."passes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "issued_by_user_id" UUID,
    "code" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "subject" TEXT,
    "classroom" TEXT,
    "reason" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
    "accompanied" BOOLEAN NOT NULL DEFAULT false,
    "companion_name" TEXT,
    "notes" TEXT,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "in_transit_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "in_care_at" TIMESTAMPTZ(6),
    "observation_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "waiting_guardian_at" TIMESTAMPTZ(6),
    "exit_authorized_at" TIMESTAMPTZ(6),
    "handed_over_at" TIMESTAMPTZ(6),
    "transferred_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "transit_alerted_at" TIMESTAMPTZ(6),
    "sla_breaches" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow"."pass_transitions" (
    "from_state" TEXT NOT NULL,
    "to_state" TEXT NOT NULL,

    CONSTRAINT "pass_transitions_pkey" PRIMARY KEY ("from_state","to_state")
);

-- CreateTable
CREATE TABLE "flow"."pass_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pass_id" UUID NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_role" TEXT NOT NULL,
    "note" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pass_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow"."exit_authorizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pass_id" UUID,
    "student_id" UUID NOT NULL,
    "authorized_by_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_GUARDIAN',
    "guardians_notified" JSONB NOT NULL DEFAULT '[]',
    "confirmed_by_person_id" UUID,
    "confirmed_by_user_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "pickup_guardian_person_id" UUID,
    "pickup_name" TEXT,
    "pickup_document" TEXT,
    "pickup_relationship" TEXT,
    "pickup_phone" TEXT,
    "estimated_arrival" TEXT,
    "standing_permission_id" UUID,
    "qr_token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exit_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow"."gate_checkouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "exit_authorization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "validated_by_user_id" UUID NOT NULL,
    "checked_out_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "verified_document" TEXT,
    "signature_file_id" UUID,
    "observations" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow"."standing_exit_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "granted_by_guardian_person_id" UUID,
    "granted_by_user_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "conditions" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standing_exit_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-CO',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channels" JSONB NOT NULL DEFAULT '{"IN_APP":true,"EMAIL":true}',
    "quiet_hours_start" TEXT NOT NULL DEFAULT '20:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '06:00',
    "language" TEXT NOT NULL DEFAULT 'es-CO',
    "whatsapp_number" TEXT,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "recipient_address" TEXT,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "entity" TEXT,
    "entity_id" TEXT,
    "dedupe_key" TEXT,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."message_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID,
    "encounter_id" UUID,
    "subject" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."thread_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(6),

    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_ids" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."circulars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "audience" JSONB NOT NULL DEFAULT '{}',
    "channels" TEXT[],
    "recipients_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "circulars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms"."circular_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "circular_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "circular_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."compliance_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compliance_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."consent_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_person_id" UUID,
    "signed_by_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "signed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'OTP',
    "ip" TEXT,
    "user_agent" TEXT,
    "signature_hash" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."consent_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."data_subject_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "subject_person_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "resolution" TEXT,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "export_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."retention_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "retention_years" INTEGER NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'REVIEW',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."retention_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "due_since" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acted_at" TIMESTAMPTZ(6),
    "acted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."legal_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "released_by_user_id" UUID,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance"."mandatory_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "student_id" UUID,
    "encounter_id" UUID,
    "authority" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "filed_reference" TEXT,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "filed_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mandatory_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "hash" TEXT,
    "prev_hash" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateTable
CREATE TABLE "integration"."external_ids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "local_id" UUID NOT NULL,
    "content_hash" TEXT NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_updated_at" TIMESTAMPTZ(6),
    "missing_since" TIMESTAMPTZ(6),

    CONSTRAINT "external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "triggered_by_user_id" UUID,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."sync_conflicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."field_ownership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "owner" TEXT NOT NULL,

    CONSTRAINT "field_ownership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."integration_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "run_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "dedupe_key" TEXT,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "core"."tenants"("slug");

-- CreateIndex
CREATE INDEX "campuses_tenant_id_idx" ON "core"."campuses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_name_key" ON "core"."academic_years"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sections_tenant_id_code_key" ON "core"."sections"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "grades_section_id_idx" ON "core"."grades"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_code_key" ON "core"."grades"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "groups_grade_id_idx" ON "core"."groups"("grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_tenant_id_code_key" ON "core"."groups"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "periods_tenant_id_idx" ON "core"."periods"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_days_tenant_id_date_key" ON "core"."calendar_days"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "schedule_blocks_tenant_id_group_id_day_of_week_idx" ON "core"."schedule_blocks"("tenant_id", "group_id", "day_of_week");

-- CreateIndex
CREATE INDEX "users_person_id_idx" ON "core"."users"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "core"."users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_key_key" ON "core"."roles"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_role_key_permission_key_key" ON "core"."role_permissions"("tenant_id", "role_key", "permission_key");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_idx" ON "core"."user_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_scope_section_id_key" ON "core"."user_roles"("user_id", "role", "scope_section_id");

-- CreateIndex
CREATE INDEX "teacher_groups_tenant_id_idx" ON "core"."teacher_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_groups_user_id_group_id_key" ON "core"."teacher_groups"("user_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "core"."sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_user_id_idx" ON "core"."sessions"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "mfa_devices_tenant_id_user_id_idx" ON "core"."mfa_devices"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "core"."api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "core"."api_keys"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_user_id_key_key" ON "core"."idempotency_keys"("tenant_id", "user_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "link_tokens_token_hash_key" ON "core"."link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "link_tokens_tenant_id_subject_id_idx" ON "core"."link_tokens"("tenant_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_code_key" ON "core"."invitations"("code");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_student_id_idx" ON "core"."invitations"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "core"."files"("storage_key");

-- CreateIndex
CREATE INDEX "files_tenant_id_owner_person_id_idx" ON "core"."files"("tenant_id", "owner_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "core"."push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_tenant_id_user_id_idx" ON "core"."push_subscriptions"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "scheduled_reports_tenant_id_idx" ON "core"."scheduled_reports"("tenant_id");

-- CreateIndex
CREATE INDEX "persons_tenant_id_kind_idx" ON "people"."persons"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "persons_tenant_id_document_number_idx" ON "people"."persons"("tenant_id", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "students_person_id_key" ON "people"."students"("person_id");

-- CreateIndex
CREATE INDEX "students_tenant_id_current_group_id_idx" ON "people"."students"("tenant_id", "current_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_code_key" ON "people"."students"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_person_id_key" ON "people"."guardians"("person_id");

-- CreateIndex
CREATE INDEX "guardians_tenant_id_idx" ON "people"."guardians"("tenant_id");

-- CreateIndex
CREATE INDEX "student_guardians_tenant_id_guardian_id_idx" ON "people"."student_guardians"("tenant_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_student_id_guardian_id_key" ON "people"."student_guardians"("student_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_person_id_key" ON "people"."staff"("person_id");

-- CreateIndex
CREATE INDEX "staff_tenant_id_idx" ON "people"."staff"("tenant_id");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_person_id_idx" ON "people"."contacts"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "addresses_tenant_id_person_id_idx" ON "people"."addresses"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_tenant_id_student_id_idx" ON "people"."emergency_contacts"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_idx" ON "people"."enrollments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_year_label_key" ON "people"."enrollments"("student_id", "year_label");

-- CreateIndex
CREATE UNIQUE INDEX "health_profiles_person_id_key" ON "clinical"."health_profiles"("person_id");

-- CreateIndex
CREATE INDEX "health_profiles_tenant_id_idx" ON "clinical"."health_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "allergies_tenant_id_person_id_idx" ON "clinical"."allergies"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "chronic_conditions_tenant_id_person_id_idx" ON "clinical"."chronic_conditions"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "care_plans_tenant_id_person_id_idx" ON "clinical"."care_plans"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "immunizations_tenant_id_person_id_idx" ON "clinical"."immunizations"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "home_medications_tenant_id_person_id_idx" ON "clinical"."home_medications"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "devices_tenant_id_person_id_idx" ON "clinical"."devices"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "activity_restrictions_tenant_id_person_id_idx" ON "clinical"."activity_restrictions"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "surgical_history_tenant_id_person_id_idx" ON "clinical"."surgical_history"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "disabilities_supports_tenant_id_person_id_idx" ON "clinical"."disabilities_supports"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "anthropometrics_tenant_id_person_id_measured_at_idx" ON "clinical"."anthropometrics"("tenant_id", "person_id", "measured_at");

-- CreateIndex
CREATE INDEX "screenings_tenant_id_person_id_idx" ON "clinical"."screenings"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "health_documents_tenant_id_person_id_idx" ON "clinical"."health_documents"("tenant_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_pass_id_key" ON "clinical"."encounters"("pass_id");

-- CreateIndex
CREATE INDEX "encounters_tenant_id_person_id_started_at_idx" ON "clinical"."encounters"("tenant_id", "person_id", "started_at");

-- CreateIndex
CREATE INDEX "encounters_tenant_id_status_idx" ON "clinical"."encounters"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "encounters_tenant_id_started_at_idx" ON "clinical"."encounters"("tenant_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_tenant_id_source_external_id_key" ON "clinical"."encounters"("tenant_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "vital_signs_tenant_id_encounter_id_idx" ON "clinical"."vital_signs"("tenant_id", "encounter_id");

-- CreateIndex
CREATE INDEX "encounter_notes_tenant_id_encounter_id_idx" ON "clinical"."encounter_notes"("tenant_id", "encounter_id");

-- CreateIndex
CREATE INDEX "encounter_diagnoses_tenant_id_code_idx" ON "clinical"."encounter_diagnoses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "encounter_diagnoses_encounter_id_idx" ON "clinical"."encounter_diagnoses"("encounter_id");

-- CreateIndex
CREATE INDEX "encounter_procedures_tenant_id_encounter_id_idx" ON "clinical"."encounter_procedures"("tenant_id", "encounter_id");

-- CreateIndex
CREATE INDEX "encounter_attachments_tenant_id_encounter_id_idx" ON "clinical"."encounter_attachments"("tenant_id", "encounter_id");

-- CreateIndex
CREATE INDEX "observation_periods_tenant_id_ended_at_idx" ON "clinical"."observation_periods"("tenant_id", "ended_at");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_encounter_id_idx" ON "clinical"."referrals"("tenant_id", "encounter_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_reports_encounter_id_key" ON "clinical"."incident_reports"("encounter_id");

-- CreateIndex
CREATE INDEX "incident_reports_tenant_id_place_idx" ON "clinical"."incident_reports"("tenant_id", "place");

-- CreateIndex
CREATE INDEX "mental_health_notes_tenant_id_person_id_idx" ON "clinical"."mental_health_notes"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "clinical_access_log_tenant_id_person_id_created_at_idx" ON "clinical"."clinical_access_log"("tenant_id", "person_id", "created_at");

-- CreateIndex
CREATE INDEX "clinical_access_log_tenant_id_user_id_created_at_idx" ON "clinical"."clinical_access_log"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbreak_signals_tenant_id_dedupe_key_key" ON "clinical"."outbreak_signals"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "campaigns_tenant_id_idx" ON "clinical"."campaigns"("tenant_id");

-- CreateIndex
CREATE INDEX "campaign_participants_tenant_id_idx" ON "clinical"."campaign_participants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_participants_campaign_id_student_id_key" ON "clinical"."campaign_participants"("campaign_id", "student_id");

-- CreateIndex
CREATE INDEX "absence_excuses_tenant_id_student_id_idx" ON "clinical"."absence_excuses"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "field_trips_tenant_id_date_idx" ON "clinical"."field_trips"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "emergency_drills_tenant_id_idx" ON "clinical"."emergency_drills"("tenant_id");

-- CreateIndex
CREATE INDEX "safety_resources_tenant_id_idx" ON "clinical"."safety_resources"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_catalog_tenant_id_generic_name_form_concentratio_key" ON "meds"."medication_catalog"("tenant_id", "generic_name", "form", "concentration");

-- CreateIndex
CREATE INDEX "medication_requests_tenant_id_student_id_status_idx" ON "meds"."medication_requests"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "prescriptions_tenant_id_request_id_idx" ON "meds"."prescriptions"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "medication_custody_tenant_id_request_id_idx" ON "meds"."medication_custody"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "medication_schedule_tenant_id_scheduled_for_status_idx" ON "meds"."medication_schedule"("tenant_id", "scheduled_for", "status");

-- CreateIndex
CREATE UNIQUE INDEX "medication_schedule_request_id_scheduled_for_key" ON "meds"."medication_schedule"("request_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "medication_administrations_tenant_id_student_id_administere_idx" ON "meds"."medication_administrations"("tenant_id", "student_id", "administered_at");

-- CreateIndex
CREATE INDEX "medication_administrations_tenant_id_administered_at_idx" ON "meds"."medication_administrations"("tenant_id", "administered_at");

-- CreateIndex
CREATE UNIQUE INDEX "items_tenant_id_name_key" ON "inventory"."items"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenant_id_name_key" ON "inventory"."locations"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "item_batches_tenant_id_item_id_expiry_date_idx" ON "inventory"."item_batches"("tenant_id", "item_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "item_batches_item_id_lot_location_id_key" ON "inventory"."item_batches"("item_id", "lot", "location_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_item_id_created_at_idx" ON "inventory"."stock_movements"("tenant_id", "item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_created_at_idx" ON "inventory"."stock_movements"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "inventory"."suppliers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "inventory"."purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "kits_tenant_id_name_key" ON "inventory"."kits"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "kit_checks_tenant_id_kit_id_idx" ON "inventory"."kit_checks"("tenant_id", "kit_id");

-- CreateIndex
CREATE INDEX "fridge_temperature_logs_tenant_id_location_id_recorded_at_idx" ON "inventory"."fridge_temperature_logs"("tenant_id", "location_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "passes_qr_token_key" ON "flow"."passes"("qr_token");

-- CreateIndex
CREATE INDEX "passes_tenant_id_state_idx" ON "flow"."passes"("tenant_id", "state");

-- CreateIndex
CREATE INDEX "passes_tenant_id_requested_at_idx" ON "flow"."passes"("tenant_id", "requested_at");

-- CreateIndex
CREATE INDEX "passes_tenant_id_student_id_idx" ON "flow"."passes"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "passes_tenant_id_issued_by_user_id_idx" ON "flow"."passes"("tenant_id", "issued_by_user_id");

-- CreateIndex
CREATE INDEX "pass_events_tenant_id_pass_id_idx" ON "flow"."pass_events"("tenant_id", "pass_id");

-- CreateIndex
CREATE UNIQUE INDEX "exit_authorizations_pass_id_key" ON "flow"."exit_authorizations"("pass_id");

-- CreateIndex
CREATE UNIQUE INDEX "exit_authorizations_qr_token_key" ON "flow"."exit_authorizations"("qr_token");

-- CreateIndex
CREATE INDEX "exit_authorizations_tenant_id_status_idx" ON "flow"."exit_authorizations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gate_checkouts_exit_authorization_id_key" ON "flow"."gate_checkouts"("exit_authorization_id");

-- CreateIndex
CREATE INDEX "gate_checkouts_tenant_id_checked_out_at_idx" ON "flow"."gate_checkouts"("tenant_id", "checked_out_at");

-- CreateIndex
CREATE INDEX "standing_exit_permissions_tenant_id_student_id_idx" ON "flow"."standing_exit_permissions"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_event_channel_locale_key" ON "comms"."notification_templates"("tenant_id", "event", "channel", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "comms"."notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "notification_preferences_tenant_id_idx" ON "comms"."notification_preferences"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_created_at_idx" ON "comms"."notifications"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "comms"."notifications"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_dedupe_key_key" ON "comms"."notifications"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "message_threads_tenant_id_student_id_idx" ON "comms"."message_threads"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "thread_participants_tenant_id_user_id_idx" ON "comms"."thread_participants"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_participants_thread_id_user_id_key" ON "comms"."thread_participants"("thread_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_tenant_id_thread_id_created_at_idx" ON "comms"."messages"("tenant_id", "thread_id", "created_at");

-- CreateIndex
CREATE INDEX "circulars_tenant_id_published_at_idx" ON "comms"."circulars"("tenant_id", "published_at");

-- CreateIndex
CREATE INDEX "circular_recipients_tenant_id_user_id_idx" ON "comms"."circular_recipients"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "circular_recipients_circular_id_user_id_key" ON "comms"."circular_recipients"("circular_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_profiles_tenant_id_country_key" ON "compliance"."compliance_profiles"("tenant_id", "country");

-- CreateIndex
CREATE UNIQUE INDEX "consent_templates_tenant_id_type_version_key" ON "compliance"."consent_templates"("tenant_id", "type", "version");

-- CreateIndex
CREATE INDEX "consents_tenant_id_student_id_status_idx" ON "compliance"."consents"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "consent_otps_tenant_id_user_id_idx" ON "compliance"."consent_otps"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_tenant_id_status_idx" ON "compliance"."data_subject_requests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_tenant_id_entity_key" ON "compliance"."retention_policies"("tenant_id", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "retention_flags_tenant_id_person_id_entity_key" ON "compliance"."retention_flags"("tenant_id", "person_id", "entity");

-- CreateIndex
CREATE INDEX "legal_holds_tenant_id_person_id_idx" ON "compliance"."legal_holds"("tenant_id", "person_id");

-- CreateIndex
CREATE INDEX "mandatory_reports_tenant_id_status_idx" ON "compliance"."mandatory_reports"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_entity_id_idx" ON "audit"."audit_log"("tenant_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_actor_user_id_idx" ON "audit"."audit_log"("tenant_id", "actor_user_id");

-- CreateIndex
CREATE INDEX "external_ids_tenant_id_entity_local_id_idx" ON "integration"."external_ids"("tenant_id", "entity", "local_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_ids_tenant_id_source_entity_external_id_key" ON "integration"."external_ids"("tenant_id", "source", "entity", "external_id");

-- CreateIndex
CREATE INDEX "sync_runs_tenant_id_started_at_idx" ON "integration"."sync_runs"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "sync_conflicts_tenant_id_status_idx" ON "integration"."sync_conflicts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "field_ownership_tenant_id_entity_field_key" ON "integration"."field_ownership"("tenant_id", "entity", "field");

-- CreateIndex
CREATE INDEX "webhook_events_tenant_id_status_idx" ON "integration"."webhook_events"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_settings_tenant_id_provider_key" ON "integration"."integration_settings"("tenant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "integration"."jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "integration"."jobs"("status", "run_at");

-- AddForeignKey
ALTER TABLE "core"."grades" ADD CONSTRAINT "grades_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "core"."sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."groups" ADD CONSTRAINT "groups_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "core"."grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."schedule_blocks" ADD CONSTRAINT "schedule_blocks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "core"."groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."teacher_groups" ADD CONSTRAINT "teacher_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."teacher_groups" ADD CONSTRAINT "teacher_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "core"."groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."mfa_devices" ADD CONSTRAINT "mfa_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."students" ADD CONSTRAINT "students_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."students" ADD CONSTRAINT "students_current_group_id_fkey" FOREIGN KEY ("current_group_id") REFERENCES "core"."groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."guardians" ADD CONSTRAINT "guardians_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "people"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "people"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."staff" ADD CONSTRAINT "staff_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."contacts" ADD CONSTRAINT "contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."addresses" ADD CONSTRAINT "addresses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."emergency_contacts" ADD CONSTRAINT "emergency_contacts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "people"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people"."enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "people"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."health_profiles" ADD CONSTRAINT "health_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."allergies" ADD CONSTRAINT "allergies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."chronic_conditions" ADD CONSTRAINT "chronic_conditions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_plans" ADD CONSTRAINT "care_plans_condition_id_fkey" FOREIGN KEY ("condition_id") REFERENCES "clinical"."chronic_conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounters" ADD CONSTRAINT "encounters_pass_id_fkey" FOREIGN KEY ("pass_id") REFERENCES "flow"."passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."vital_signs" ADD CONSTRAINT "vital_signs_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounter_notes" ADD CONSTRAINT "encounter_notes_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounter_diagnoses" ADD CONSTRAINT "encounter_diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounter_procedures" ADD CONSTRAINT "encounter_procedures_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."encounter_attachments" ADD CONSTRAINT "encounter_attachments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."observation_periods" ADD CONSTRAINT "observation_periods_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."referrals" ADD CONSTRAINT "referrals_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."incident_reports" ADD CONSTRAINT "incident_reports_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "clinical"."encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "clinical"."campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meds"."medication_requests" ADD CONSTRAINT "medication_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "people"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meds"."prescriptions" ADD CONSTRAINT "prescriptions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "meds"."medication_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meds"."medication_custody" ADD CONSTRAINT "medication_custody_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "meds"."medication_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meds"."medication_schedule" ADD CONSTRAINT "medication_schedule_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "meds"."medication_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meds"."medication_administrations" ADD CONSTRAINT "medication_administrations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "meds"."medication_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meds"."medication_administrations" ADD CONSTRAINT "medication_administrations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "meds"."medication_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item_batches" ADD CONSTRAINT "item_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."item_batches" ADD CONSTRAINT "item_batches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory"."item_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."kit_checks" ADD CONSTRAINT "kit_checks_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "inventory"."kits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow"."passes" ADD CONSTRAINT "passes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "people"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow"."pass_events" ADD CONSTRAINT "pass_events_pass_id_fkey" FOREIGN KEY ("pass_id") REFERENCES "flow"."passes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow"."exit_authorizations" ADD CONSTRAINT "exit_authorizations_pass_id_fkey" FOREIGN KEY ("pass_id") REFERENCES "flow"."passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow"."gate_checkouts" ADD CONSTRAINT "gate_checkouts_exit_authorization_id_fkey" FOREIGN KEY ("exit_authorization_id") REFERENCES "flow"."exit_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."thread_participants" ADD CONSTRAINT "thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comms"."message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comms"."message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms"."circular_recipients" ADD CONSTRAINT "circular_recipients_circular_id_fkey" FOREIGN KEY ("circular_id") REFERENCES "comms"."circulars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance"."consents" ADD CONSTRAINT "consents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "compliance"."consent_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration"."sync_conflicts" ADD CONSTRAINT "sync_conflicts_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration"."sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

