CREATE TABLE "examiner_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"mode" text NOT NULL,
	"scenario" text NOT NULL,
	"overall_score" integer NOT NULL,
	"dimensions" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"feedback" text NOT NULL,
	"transcript" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "examiner_attempts" ADD CONSTRAINT "examiner_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examiner_attempts" ADD CONSTRAINT "examiner_attempts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "examiner_attempts_user_created_idx" ON "examiner_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "examiner_attempts_user_thread_uniq" ON "examiner_attempts" USING btree ("user_id","thread_id");--> statement-breakpoint
-- AI analytics: the `ai` schema (Hadafi). Ported from SMEEP's
-- server/db/aiViews/001_ai_schema.sql. Two rules govern everything below.
--
-- 1. NO PERSONAL DATA. No names, emails, phone numbers, bios, company names,
--    avatar or image URLs, meeting, Zoom, recording or LinkedIn links, mentor
--    notes, quiz or assessment answers, billing fields, Stripe ids,
--    certificate numbers, URLs or file paths, tokens, password hashes,
--    notification or announcement text, organisation names or join codes,
--    and nothing from the auth_* tables. A person is reduced to the
--    platform's own users.id uuid (learner_id / mentor_id) plus category
--    labels. An administrator can map that id back to a person, so this is
--    pseudonymous data, not anonymous data. server/tests/ai-schema.test.ts
--    checks every live column name against a list of personal-data patterns.
--
-- 2. THE BUSINESS RULES ARE BAKED IN. Who counts as a learner
--    (users.role = 'sme'), what "completed" means and how ISO country codes
--    fold into names are resolved here, in SQL, so a generated query never
--    has to re-derive them.
--
-- Plain views over live data: no refresh job. Views only reference base
-- tables and the helper functions below, never each other.
--
-- HOW THIS FILE SHIPS. This file is the source of truth, and each drizzle
-- migration that changes the views carries a verbatim copy of it (the first
-- is 0029_ai_views.sql; 0030_ai_examiner.sql added ai.ai_exam_attempt). It is re-runnable: every ai view is dropped and
-- recreated, so a migration that applies it leaves exactly these views.
-- To change a view, or after another migration changes a column a view
-- reads: edit this file, update server/services/ai-sql/schema-catalog.ts,
-- run `npx drizzle-kit generate --config ./drizzle.config.ts --custom
-- --name ai_views_<what>` and paste this whole file into the new migration.
-- Postgres refuses to drop or retype a column that a view
-- reads, so a migration that does that to a column used here must drop the
-- ai views first (the DO block below) and then re-create them (this file,
-- updated). See docs/ai-analytics.md.

CREATE SCHEMA IF NOT EXISTS ai;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'ai'
    WHERE c.relkind = 'v'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS ai.%I CASCADE', r.relname);
  END LOOP;
END $$;

/* ------------------------------------------------------------------ */
/* Helper functions                                                    */
/* ------------------------------------------------------------------ */

-- Countries are stored as display names from the `countries-list` package
-- (the sign-up pickers), but some accounts hold the ISO 3166 alpha-2 code
-- ("AE"). Codes, the package's aliases ("UAE", "UK") and any casing of a
-- name all fold to the package's name, so a country is never counted twice.
-- Anything unrecognised is returned trimmed; blank becomes NULL.
CREATE OR REPLACE FUNCTION ai.country_name(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    (
      SELECT m.name
      FROM (VALUES
      ('AC', 'Ascension Island'), ('AD', 'Andorra'), ('AE', 'United Arab Emirates'), ('AF', 'Afghanistan'),
      ('AG', 'Antigua and Barbuda'), ('AI', 'Anguilla'), ('AL', 'Albania'), ('AM', 'Armenia'),
      ('AO', 'Angola'), ('AQ', 'Antarctica'), ('AR', 'Argentina'), ('AS', 'American Samoa'),
      ('AT', 'Austria'), ('AU', 'Australia'), ('AW', 'Aruba'), ('AX', 'Aland'),
      ('AZ', 'Azerbaijan'), ('BA', 'Bosnia and Herzegovina'), ('BB', 'Barbados'), ('BD', 'Bangladesh'),
      ('BE', 'Belgium'), ('BF', 'Burkina Faso'), ('BG', 'Bulgaria'), ('BH', 'Bahrain'),
      ('BI', 'Burundi'), ('BJ', 'Benin'), ('BL', 'Saint Barthelemy'), ('BM', 'Bermuda'),
      ('BN', 'Brunei'), ('BO', 'Bolivia'), ('BQ', 'Bonaire'), ('BR', 'Brazil'),
      ('BS', 'Bahamas'), ('BT', 'Bhutan'), ('BV', 'Bouvet Island'), ('BW', 'Botswana'),
      ('BY', 'Belarus'), ('BZ', 'Belize'), ('CA', 'Canada'), ('CC', 'Cocos (Keeling) Islands'),
      ('CD', 'Democratic Republic of the Congo'), ('CF', 'Central African Republic'), ('CG', 'Republic of the Congo'), ('CH', 'Switzerland'),
      ('CI', 'Ivory Coast'), ('CK', 'Cook Islands'), ('CL', 'Chile'), ('CM', 'Cameroon'),
      ('CN', 'China'), ('CO', 'Colombia'), ('CR', 'Costa Rica'), ('CU', 'Cuba'),
      ('CV', 'Cabo Verde'), ('CW', 'Curacao'), ('CX', 'Christmas Island'), ('CY', 'Cyprus'),
      ('CZ', 'Czechia'), ('DE', 'Germany'), ('DJ', 'Djibouti'), ('DK', 'Denmark'),
      ('DM', 'Dominica'), ('DO', 'Dominican Republic'), ('DZ', 'Algeria'), ('EC', 'Ecuador'),
      ('EE', 'Estonia'), ('EG', 'Egypt'), ('EH', 'Western Sahara'), ('ER', 'Eritrea'),
      ('ES', 'Spain'), ('ET', 'Ethiopia'), ('FI', 'Finland'), ('FJ', 'Fiji'),
      ('FK', 'Falkland Islands'), ('FM', 'Micronesia'), ('FO', 'Faroe Islands'), ('FR', 'France'),
      ('GA', 'Gabon'), ('GB', 'United Kingdom'), ('GD', 'Grenada'), ('GE', 'Georgia'),
      ('GF', 'French Guiana'), ('GG', 'Guernsey'), ('GH', 'Ghana'), ('GI', 'Gibraltar'),
      ('GL', 'Greenland'), ('GM', 'Gambia'), ('GN', 'Guinea'), ('GP', 'Guadeloupe'),
      ('GQ', 'Equatorial Guinea'), ('GR', 'Greece'), ('GS', 'South Georgia and the South Sandwich Islands'), ('GT', 'Guatemala'),
      ('GU', 'Guam'), ('GW', 'Guinea-Bissau'), ('GY', 'Guyana'), ('HK', 'Hong Kong'),
      ('HM', 'Heard Island and McDonald Islands'), ('HN', 'Honduras'), ('HR', 'Croatia'), ('HT', 'Haiti'),
      ('HU', 'Hungary'), ('ID', 'Indonesia'), ('IE', 'Ireland'), ('IL', 'Israel'),
      ('IM', 'Isle of Man'), ('IN', 'India'), ('IO', 'British Indian Ocean Territory'), ('IQ', 'Iraq'),
      ('IR', 'Iran'), ('IS', 'Iceland'), ('IT', 'Italy'), ('JE', 'Jersey'),
      ('JM', 'Jamaica'), ('JO', 'Jordan'), ('JP', 'Japan'), ('KE', 'Kenya'),
      ('KG', 'Kyrgyzstan'), ('KH', 'Cambodia'), ('KI', 'Kiribati'), ('KM', 'Comoros'),
      ('KN', 'Saint Kitts and Nevis'), ('KP', 'North Korea'), ('KR', 'South Korea'), ('KW', 'Kuwait'),
      ('KY', 'Cayman Islands'), ('KZ', 'Kazakhstan'), ('LA', 'Laos'), ('LB', 'Lebanon'),
      ('LC', 'Saint Lucia'), ('LI', 'Liechtenstein'), ('LK', 'Sri Lanka'), ('LR', 'Liberia'),
      ('LS', 'Lesotho'), ('LT', 'Lithuania'), ('LU', 'Luxembourg'), ('LV', 'Latvia'),
      ('LY', 'Libya'), ('MA', 'Morocco'), ('MC', 'Monaco'), ('MD', 'Moldova'),
      ('ME', 'Montenegro'), ('MF', 'Saint Martin'), ('MG', 'Madagascar'), ('MH', 'Marshall Islands'),
      ('MK', 'North Macedonia'), ('ML', 'Mali'), ('MM', 'Myanmar'), ('MN', 'Mongolia'),
      ('MO', 'Macao'), ('MP', 'Northern Mariana Islands'), ('MQ', 'Martinique'), ('MR', 'Mauritania'),
      ('MS', 'Montserrat'), ('MT', 'Malta'), ('MU', 'Mauritius'), ('MV', 'Maldives'),
      ('MW', 'Malawi'), ('MX', 'Mexico'), ('MY', 'Malaysia'), ('MZ', 'Mozambique'),
      ('NA', 'Namibia'), ('NC', 'New Caledonia'), ('NE', 'Niger'), ('NF', 'Norfolk Island'),
      ('NG', 'Nigeria'), ('NI', 'Nicaragua'), ('NL', 'Netherlands'), ('NO', 'Norway'),
      ('NP', 'Nepal'), ('NR', 'Nauru'), ('NU', 'Niue'), ('NZ', 'New Zealand'),
      ('OM', 'Oman'), ('PA', 'Panama'), ('PE', 'Peru'), ('PF', 'French Polynesia'),
      ('PG', 'Papua New Guinea'), ('PH', 'Philippines'), ('PK', 'Pakistan'), ('PL', 'Poland'),
      ('PM', 'Saint Pierre and Miquelon'), ('PN', 'Pitcairn Islands'), ('PR', 'Puerto Rico'), ('PS', 'Palestine'),
      ('PT', 'Portugal'), ('PW', 'Palau'), ('PY', 'Paraguay'), ('QA', 'Qatar'),
      ('RE', 'Reunion'), ('RO', 'Romania'), ('RS', 'Serbia'), ('RU', 'Russia'),
      ('RW', 'Rwanda'), ('SA', 'Saudi Arabia'), ('SB', 'Solomon Islands'), ('SC', 'Seychelles'),
      ('SD', 'Sudan'), ('SE', 'Sweden'), ('SG', 'Singapore'), ('SH', 'Saint Helena'),
      ('SI', 'Slovenia'), ('SJ', 'Svalbard and Jan Mayen'), ('SK', 'Slovakia'), ('SL', 'Sierra Leone'),
      ('SM', 'San Marino'), ('SN', 'Senegal'), ('SO', 'Somalia'), ('SR', 'Suriname'),
      ('SS', 'South Sudan'), ('ST', 'Sao Tome and Principe'), ('SV', 'El Salvador'), ('SX', 'Sint Maarten'),
      ('SY', 'Syria'), ('SZ', 'Eswatini'), ('TA', 'Tristan da Cunha'), ('TC', 'Turks and Caicos Islands'),
      ('TD', 'Chad'), ('TF', 'French Southern Territories'), ('TG', 'Togo'), ('TH', 'Thailand'),
      ('TJ', 'Tajikistan'), ('TK', 'Tokelau'), ('TL', 'East Timor'), ('TM', 'Turkmenistan'),
      ('TN', 'Tunisia'), ('TO', 'Tonga'), ('TR', 'Türkiye'), ('TT', 'Trinidad and Tobago'),
      ('TV', 'Tuvalu'), ('TW', 'Taiwan'), ('TZ', 'Tanzania'), ('UA', 'Ukraine'),
      ('UG', 'Uganda'), ('UM', 'U.S. Minor Outlying Islands'), ('US', 'United States'), ('UY', 'Uruguay'),
      ('UZ', 'Uzbekistan'), ('VA', 'Vatican City'), ('VC', 'Saint Vincent and the Grenadines'), ('VE', 'Venezuela'),
      ('VG', 'British Virgin Islands'), ('VI', 'U.S. Virgin Islands'), ('VN', 'Vietnam'), ('VU', 'Vanuatu'),
      ('WF', 'Wallis and Futuna'), ('WS', 'Samoa'), ('XK', 'Kosovo'), ('YE', 'Yemen'),
      ('YT', 'Mayotte'), ('ZA', 'South Africa'), ('ZM', 'Zambia'), ('ZW', 'Zimbabwe'),
      ('UAE', 'United Arab Emirates'), ('EMIRATES', 'United Arab Emirates'), ('EAST PAKISTAN', 'Bangladesh'), ('UPPER VOLTA', 'Burkina Faso'),
      ('BAHREIN', 'Bahrain'), ('DAHOMEY', 'Benin'), ('BECHUANALAND', 'Botswana'), ('BYELORUSSIA', 'Belarus'),
      ('BELORUSSIA', 'Belarus'), ('BRITISH HONDURAS', 'Belize'), ('ZAIRE', 'Democratic Republic of the Congo'), ('CONGO-KINSHASA', 'Democratic Republic of the Congo'),
      ('DR CONGO', 'Democratic Republic of the Congo'), ('DRC', 'Democratic Republic of the Congo'), ('UBANGI-SHARI', 'Central African Republic'), ('CONGO-BRAZZAVILLE', 'Republic of the Congo'),
      ('COTE D''IVOIRE', 'Ivory Coast'), ('CAPE VERDE', 'Cabo Verde'), ('CZECH REPUBLIC', 'Czechia'), ('ČESKÁ REPUBLIKA', 'Czechia'),
      ('SPANISH SAHARA', 'Western Sahara'), ('ABYSSINIA', 'Ethiopia'), ('UK', 'United Kingdom'), ('BRITAIN', 'United Kingdom'),
      ('GREAT BRITAIN', 'United Kingdom'), ('GOLD COAST', 'Ghana'), ('PORTUGUESE GUINEA', 'Guinea-Bissau'), ('DUTCH EAST INDIES', 'Indonesia'),
      ('PERSIA', 'Iran'), ('KIRGHIZIA', 'Kyrgyzstan'), ('KYRGYZ REPUBLIC', 'Kyrgyzstan'), ('KAMPUCHEA', 'Cambodia'),
      ('GILBERT ISLANDS', 'Kiribati'), ('DPRK', 'North Korea'), ('REPUBLIC OF KOREA', 'South Korea'), ('LAO PDR', 'Laos'),
      ('CEYLON', 'Sri Lanka'), ('BASUTOLAND', 'Lesotho'), ('MOLDAVIA', 'Moldova'), ('MACEDONIA', 'North Macedonia'),
      ('FYROM', 'North Macedonia'), ('FRENCH SUDAN', 'Mali'), ('BURMA', 'Myanmar'), ('MYANMAR (BURMA)', 'Myanmar'),
      ('MACAU', 'Macao'), ('NYASALAND', 'Malawi'), ('SOUTH WEST AFRICA', 'Namibia'), ('HOLLAND', 'Netherlands'),
      ('RUMANIA', 'Romania'), ('ROUMANIA', 'Romania'), ('RUSSIAN FEDERATION', 'Russia'), ('SYRIAN ARAB REPUBLIC', 'Syria'),
      ('SWAZILAND', 'Eswatini'), ('SIAM', 'Thailand'), ('TURKMENIA', 'Turkmenistan'), ('TURKEY', 'Türkiye'),
      ('TURKIYE', 'Türkiye'), ('ELLICE ISLANDS', 'Tuvalu'), ('FORMOSA', 'Taiwan'), ('TANGANYIKA', 'Tanzania'),
      ('USA', 'United States'), ('AMERICA', 'United States'), ('UNITED STATES OF AMERICA', 'United States'), ('HOLY SEE', 'Vatican City'),
      ('VATICAN', 'Vatican City'), ('VIET NAM', 'Vietnam'), ('NEW HEBRIDES', 'Vanuatu'), ('NORTHERN RHODESIA', 'Zambia'),
      ('RHODESIA', 'Zimbabwe'), ('SOUTHERN RHODESIA', 'Zimbabwe'), ('ASCENSION ISLAND', 'Ascension Island'), ('ANDORRA', 'Andorra'),
      ('UNITED ARAB EMIRATES', 'United Arab Emirates'), ('AFGHANISTAN', 'Afghanistan'), ('ANTIGUA AND BARBUDA', 'Antigua and Barbuda'), ('ANGUILLA', 'Anguilla'),
      ('ALBANIA', 'Albania'), ('ARMENIA', 'Armenia'), ('ANGOLA', 'Angola'), ('ANTARCTICA', 'Antarctica'),
      ('ARGENTINA', 'Argentina'), ('AMERICAN SAMOA', 'American Samoa'), ('AUSTRIA', 'Austria'), ('AUSTRALIA', 'Australia'),
      ('ARUBA', 'Aruba'), ('ALAND', 'Aland'), ('AZERBAIJAN', 'Azerbaijan'), ('BOSNIA AND HERZEGOVINA', 'Bosnia and Herzegovina'),
      ('BARBADOS', 'Barbados'), ('BANGLADESH', 'Bangladesh'), ('BELGIUM', 'Belgium'), ('BURKINA FASO', 'Burkina Faso'),
      ('BULGARIA', 'Bulgaria'), ('BAHRAIN', 'Bahrain'), ('BURUNDI', 'Burundi'), ('BENIN', 'Benin'),
      ('SAINT BARTHELEMY', 'Saint Barthelemy'), ('BERMUDA', 'Bermuda'), ('BRUNEI', 'Brunei'), ('BOLIVIA', 'Bolivia'),
      ('BONAIRE', 'Bonaire'), ('BRAZIL', 'Brazil'), ('BAHAMAS', 'Bahamas'), ('BHUTAN', 'Bhutan'),
      ('BOUVET ISLAND', 'Bouvet Island'), ('BOTSWANA', 'Botswana'), ('BELARUS', 'Belarus'), ('BELIZE', 'Belize'),
      ('CANADA', 'Canada'), ('COCOS (KEELING) ISLANDS', 'Cocos (Keeling) Islands'), ('DEMOCRATIC REPUBLIC OF THE CONGO', 'Democratic Republic of the Congo'), ('CENTRAL AFRICAN REPUBLIC', 'Central African Republic'),
      ('REPUBLIC OF THE CONGO', 'Republic of the Congo'), ('SWITZERLAND', 'Switzerland'), ('IVORY COAST', 'Ivory Coast'), ('COOK ISLANDS', 'Cook Islands'),
      ('CHILE', 'Chile'), ('CAMEROON', 'Cameroon'), ('CHINA', 'China'), ('COLOMBIA', 'Colombia'),
      ('COSTA RICA', 'Costa Rica'), ('CUBA', 'Cuba'), ('CABO VERDE', 'Cabo Verde'), ('CURACAO', 'Curacao'),
      ('CHRISTMAS ISLAND', 'Christmas Island'), ('CYPRUS', 'Cyprus'), ('CZECHIA', 'Czechia'), ('GERMANY', 'Germany'),
      ('DJIBOUTI', 'Djibouti'), ('DENMARK', 'Denmark'), ('DOMINICA', 'Dominica'), ('DOMINICAN REPUBLIC', 'Dominican Republic'),
      ('ALGERIA', 'Algeria'), ('ECUADOR', 'Ecuador'), ('ESTONIA', 'Estonia'), ('EGYPT', 'Egypt'),
      ('WESTERN SAHARA', 'Western Sahara'), ('ERITREA', 'Eritrea'), ('SPAIN', 'Spain'), ('ETHIOPIA', 'Ethiopia'),
      ('FINLAND', 'Finland'), ('FIJI', 'Fiji'), ('FALKLAND ISLANDS', 'Falkland Islands'), ('MICRONESIA', 'Micronesia'),
      ('FAROE ISLANDS', 'Faroe Islands'), ('FRANCE', 'France'), ('GABON', 'Gabon'), ('UNITED KINGDOM', 'United Kingdom'),
      ('GRENADA', 'Grenada'), ('GEORGIA', 'Georgia'), ('FRENCH GUIANA', 'French Guiana'), ('GUERNSEY', 'Guernsey'),
      ('GHANA', 'Ghana'), ('GIBRALTAR', 'Gibraltar'), ('GREENLAND', 'Greenland'), ('GAMBIA', 'Gambia'),
      ('GUINEA', 'Guinea'), ('GUADELOUPE', 'Guadeloupe'), ('EQUATORIAL GUINEA', 'Equatorial Guinea'), ('GREECE', 'Greece'),
      ('SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS', 'South Georgia and the South Sandwich Islands'), ('GUATEMALA', 'Guatemala'), ('GUAM', 'Guam'), ('GUINEA-BISSAU', 'Guinea-Bissau'),
      ('GUYANA', 'Guyana'), ('HONG KONG', 'Hong Kong'), ('HEARD ISLAND AND MCDONALD ISLANDS', 'Heard Island and McDonald Islands'), ('HONDURAS', 'Honduras'),
      ('CROATIA', 'Croatia'), ('HAITI', 'Haiti'), ('HUNGARY', 'Hungary'), ('INDONESIA', 'Indonesia'),
      ('IRELAND', 'Ireland'), ('ISRAEL', 'Israel'), ('ISLE OF MAN', 'Isle of Man'), ('INDIA', 'India'),
      ('BRITISH INDIAN OCEAN TERRITORY', 'British Indian Ocean Territory'), ('IRAQ', 'Iraq'), ('IRAN', 'Iran'), ('ICELAND', 'Iceland'),
      ('ITALY', 'Italy'), ('JERSEY', 'Jersey'), ('JAMAICA', 'Jamaica'), ('JORDAN', 'Jordan'),
      ('JAPAN', 'Japan'), ('KENYA', 'Kenya'), ('KYRGYZSTAN', 'Kyrgyzstan'), ('CAMBODIA', 'Cambodia'),
      ('KIRIBATI', 'Kiribati'), ('COMOROS', 'Comoros'), ('SAINT KITTS AND NEVIS', 'Saint Kitts and Nevis'), ('NORTH KOREA', 'North Korea'),
      ('SOUTH KOREA', 'South Korea'), ('KUWAIT', 'Kuwait'), ('CAYMAN ISLANDS', 'Cayman Islands'), ('KAZAKHSTAN', 'Kazakhstan'),
      ('LAOS', 'Laos'), ('LEBANON', 'Lebanon'), ('SAINT LUCIA', 'Saint Lucia'), ('LIECHTENSTEIN', 'Liechtenstein'),
      ('SRI LANKA', 'Sri Lanka'), ('LIBERIA', 'Liberia'), ('LESOTHO', 'Lesotho'), ('LITHUANIA', 'Lithuania'),
      ('LUXEMBOURG', 'Luxembourg'), ('LATVIA', 'Latvia'), ('LIBYA', 'Libya'), ('MOROCCO', 'Morocco'),
      ('MONACO', 'Monaco'), ('MOLDOVA', 'Moldova'), ('MONTENEGRO', 'Montenegro'), ('SAINT MARTIN', 'Saint Martin'),
      ('MADAGASCAR', 'Madagascar'), ('MARSHALL ISLANDS', 'Marshall Islands'), ('NORTH MACEDONIA', 'North Macedonia'), ('MALI', 'Mali'),
      ('MYANMAR', 'Myanmar'), ('MONGOLIA', 'Mongolia'), ('MACAO', 'Macao'), ('NORTHERN MARIANA ISLANDS', 'Northern Mariana Islands'),
      ('MARTINIQUE', 'Martinique'), ('MAURITANIA', 'Mauritania'), ('MONTSERRAT', 'Montserrat'), ('MALTA', 'Malta'),
      ('MAURITIUS', 'Mauritius'), ('MALDIVES', 'Maldives'), ('MALAWI', 'Malawi'), ('MEXICO', 'Mexico'),
      ('MALAYSIA', 'Malaysia'), ('MOZAMBIQUE', 'Mozambique'), ('NAMIBIA', 'Namibia'), ('NEW CALEDONIA', 'New Caledonia'),
      ('NIGER', 'Niger'), ('NORFOLK ISLAND', 'Norfolk Island'), ('NIGERIA', 'Nigeria'), ('NICARAGUA', 'Nicaragua'),
      ('NETHERLANDS', 'Netherlands'), ('NORWAY', 'Norway'), ('NEPAL', 'Nepal'), ('NAURU', 'Nauru'),
      ('NIUE', 'Niue'), ('NEW ZEALAND', 'New Zealand'), ('OMAN', 'Oman'), ('PANAMA', 'Panama'),
      ('PERU', 'Peru'), ('FRENCH POLYNESIA', 'French Polynesia'), ('PAPUA NEW GUINEA', 'Papua New Guinea'), ('PHILIPPINES', 'Philippines'),
      ('PAKISTAN', 'Pakistan'), ('POLAND', 'Poland'), ('SAINT PIERRE AND MIQUELON', 'Saint Pierre and Miquelon'), ('PITCAIRN ISLANDS', 'Pitcairn Islands'),
      ('PUERTO RICO', 'Puerto Rico'), ('PALESTINE', 'Palestine'), ('PORTUGAL', 'Portugal'), ('PALAU', 'Palau'),
      ('PARAGUAY', 'Paraguay'), ('QATAR', 'Qatar'), ('REUNION', 'Reunion'), ('ROMANIA', 'Romania'),
      ('SERBIA', 'Serbia'), ('RUSSIA', 'Russia'), ('RWANDA', 'Rwanda'), ('SAUDI ARABIA', 'Saudi Arabia'),
      ('SOLOMON ISLANDS', 'Solomon Islands'), ('SEYCHELLES', 'Seychelles'), ('SUDAN', 'Sudan'), ('SWEDEN', 'Sweden'),
      ('SINGAPORE', 'Singapore'), ('SAINT HELENA', 'Saint Helena'), ('SLOVENIA', 'Slovenia'), ('SVALBARD AND JAN MAYEN', 'Svalbard and Jan Mayen'),
      ('SLOVAKIA', 'Slovakia'), ('SIERRA LEONE', 'Sierra Leone'), ('SAN MARINO', 'San Marino'), ('SENEGAL', 'Senegal'),
      ('SOMALIA', 'Somalia'), ('SURINAME', 'Suriname'), ('SOUTH SUDAN', 'South Sudan'), ('SAO TOME AND PRINCIPE', 'Sao Tome and Principe'),
      ('EL SALVADOR', 'El Salvador'), ('SINT MAARTEN', 'Sint Maarten'), ('SYRIA', 'Syria'), ('ESWATINI', 'Eswatini'),
      ('TRISTAN DA CUNHA', 'Tristan da Cunha'), ('TURKS AND CAICOS ISLANDS', 'Turks and Caicos Islands'), ('CHAD', 'Chad'), ('FRENCH SOUTHERN TERRITORIES', 'French Southern Territories'),
      ('TOGO', 'Togo'), ('THAILAND', 'Thailand'), ('TAJIKISTAN', 'Tajikistan'), ('TOKELAU', 'Tokelau'),
      ('EAST TIMOR', 'East Timor'), ('TURKMENISTAN', 'Turkmenistan'), ('TUNISIA', 'Tunisia'), ('TONGA', 'Tonga'),
      ('TÜRKIYE', 'Türkiye'), ('TRINIDAD AND TOBAGO', 'Trinidad and Tobago'), ('TUVALU', 'Tuvalu'), ('TAIWAN', 'Taiwan'),
      ('TANZANIA', 'Tanzania'), ('UKRAINE', 'Ukraine'), ('UGANDA', 'Uganda'), ('U.S. MINOR OUTLYING ISLANDS', 'U.S. Minor Outlying Islands'),
      ('UNITED STATES', 'United States'), ('URUGUAY', 'Uruguay'), ('UZBEKISTAN', 'Uzbekistan'), ('VATICAN CITY', 'Vatican City'),
      ('SAINT VINCENT AND THE GRENADINES', 'Saint Vincent and the Grenadines'), ('VENEZUELA', 'Venezuela'), ('BRITISH VIRGIN ISLANDS', 'British Virgin Islands'), ('U.S. VIRGIN ISLANDS', 'U.S. Virgin Islands'),
      ('VIETNAM', 'Vietnam'), ('VANUATU', 'Vanuatu'), ('WALLIS AND FUTUNA', 'Wallis and Futuna'), ('SAMOA', 'Samoa'),
      ('KOSOVO', 'Kosovo'), ('YEMEN', 'Yemen'), ('MAYOTTE', 'Mayotte'), ('SOUTH AFRICA', 'South Africa'),
      ('ZAMBIA', 'Zambia'), ('ZIMBABWE', 'Zimbabwe')
      ) AS m(k, name)
      WHERE m.k = upper(trim(raw))
    ),
    nullif(trim(raw), '')
  );
$$;

-- Mentor expertise is a free-typed text[] on the application.
CREATE OR REPLACE FUNCTION ai.expertise_list(areas text[])
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(array_to_string(array(
    SELECT trim(x) FROM unnest(areas) AS x WHERE trim(x) <> ''
  ), ', '), '');
$$;

/* ------------------------------------------------------------------ */
/* Learners and courses                                                */
/* ------------------------------------------------------------------ */

-- ai.learner: one row per learner (users.role = 'sme'). Mentors and admins
-- never appear in a learner-keyed view.
CREATE VIEW ai.learner AS
SELECT
  u.id                                    AS learner_id,
  ai.country_name(u.country)              AS country,
  u.created_at::date                      AS signed_up_on,
  date_trunc('month', u.created_at)::date AS signup_month,
  u.last_active_at::date                  AS last_active_on,
  u.email_verified                        AS verified,
  (u.invite_code_id IS NOT NULL)          AS signed_up_with_invite,
  u.organisation_id                       AS organisation_id,
  u.points                                AS points
FROM users u
WHERE u.role = 'sme';

-- ai.course: one row per course in the library, drafts included.
CREATE VIEW ai.course AS
SELECT
  c.id                     AS course_id,
  c.title                  AS title,
  c.category               AS category,
  c.difficulty::text       AS difficulty,
  c.status::text           AS status,
  c.enable_certificate     AS certificate_enabled,
  c.created_at::date       AS created_on,
  (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id) AS module_count,
  (SELECT count(*)::int FROM units un JOIN modules m ON m.id = un.module_id WHERE m.course_id = c.id) AS unit_count,
  (SELECT count(*)::int
     FROM learning_blocks b
     JOIN units un ON un.id = b.unit_id
     JOIN modules m ON m.id = un.module_id
    WHERE m.course_id = c.id)                                   AS lesson_count
FROM courses c;

-- ai.course_progress: one row per learner per course they enrolled in or
-- started. Enrollment status never moves to 'completed' in the app;
-- completion is user_course_progress reaching 100%.
CREATE VIEW ai.course_progress AS
SELECT
  coalesce(ce.user_id, p.user_id)                    AS learner_id,
  coalesce(ce.course_id, p.course_id)                AS course_id,
  (ce.id IS NOT NULL)                                AS enrolled,
  ce.status::text                                    AS enrollment_status,
  ce.enrolled_at::date                               AS enrolled_on,
  p.started_at::date                                 AS started_on,
  p.updated_at::date                                 AS last_progress_on,
  coalesce(p.progress_percentage, 0)                 AS progress_pct,
  coalesce(p.completed_modules, 0)                   AS completed_modules,
  p.total_modules                                    AS total_modules,
  (p.completed_at IS NOT NULL OR coalesce(p.progress_percentage, 0) >= 100) AS completed,
  p.completed_at::date                               AS completed_on
FROM course_enrollments ce
FULL JOIN user_course_progress p ON p.user_id = ce.user_id AND p.course_id = ce.course_id
JOIN users u ON u.id = coalesce(ce.user_id, p.user_id) AND u.role = 'sme';

-- ai.lesson_progress: one row per learner per lesson (learning block) they
-- have opened or finished.
CREATE VIEW ai.lesson_progress AS
SELECT
  bp.user_id                 AS learner_id,
  bp.learning_block_id       AS lesson_id,
  b.type::text               AS lesson_type,
  b.unit_id                  AS unit_id,
  un.module_id               AS module_id,
  m.course_id                AS course_id,
  bp.status::text            AS status,
  bp.video_watch_pct         AS video_watch_pct,
  bp.completed_at::date      AS completed_on
FROM user_learning_block_progress bp
JOIN users u ON u.id = bp.user_id AND u.role = 'sme'
JOIN learning_blocks b ON b.id = bp.learning_block_id
JOIN units un ON un.id = b.unit_id
JOIN modules m ON m.id = un.module_id;

-- ai.course_assessment_attempt: one row per submitted pre-test or final
-- exam attempt. Scores only, never answers.
CREATE VIEW ai.course_assessment_attempt AS
SELECT
  aa.id                      AS attempt_id,
  aa.user_id                 AS learner_id,
  a.course_id                AS course_id,
  a.assessment_type::text    AS assessment_type,
  a.is_graded                AS is_graded,
  a.passing_score            AS passing_score,
  aa.attempt_number          AS attempt_number,
  aa.score                   AS score_pct,
  aa.passed                  AS passed,
  aa.completed_at::date      AS completed_on
FROM assessment_attempts aa
JOIN assessments a ON a.id = aa.assessment_id
JOIN users u ON u.id = aa.user_id AND u.role = 'sme'
WHERE aa.completed_at IS NOT NULL;

-- ai.certificate: one row per course certificate issued to a learner. No
-- certificate number, URL or file path.
CREATE VIEW ai.certificate AS
SELECT
  cc.id                      AS certificate_id,
  cc.user_id                 AS learner_id,
  cc.course_id               AS course_id,
  cc.status::text            AS status,
  cc.issued_at::date         AS issued_on
FROM course_certificates cc
JOIN users u ON u.id = cc.user_id AND u.role = 'sme';

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

-- ai.activity_day: one row per learner per day with at least one learning
-- step (the streak table). The day is in the learner's own time zone.
CREATE VIEW ai.activity_day AS
SELECT
  d.user_id                  AS learner_id,
  d.day                      AS active_on,
  d.steps                    AS steps
FROM learner_activity_days d
JOIN users u ON u.id = d.user_id AND u.role = 'sme';

-- ai.badge_earned: one row per badge a learner earned.
CREATE VIEW ai.badge_earned AS
SELECT
  b.user_id                  AS learner_id,
  b.badge                    AS badge,
  b.earned_at::date          AS earned_on
FROM user_badges b
JOIN users u ON u.id = b.user_id AND u.role = 'sme';

-- ai.ai_exam_attempt: one row per marked AI Examiner attempt. Scores only:
-- no scenario, transcript, strengths, improvements or feedback text.
CREATE VIEW ai.ai_exam_attempt AS
SELECT
  ea.id                      AS attempt_id,
  ea.user_id                 AS learner_id,
  ea.course_id               AS course_id,
  ea.mode                    AS mode,
  ea.overall_score           AS overall_score,
  CASE WHEN jsonb_typeof(ea.dimensions->'courseKnowledge') = 'number' THEN round((ea.dimensions->>'courseKnowledge')::numeric)::int END AS course_knowledge_score,
  CASE WHEN jsonb_typeof(ea.dimensions->'application') = 'number' THEN round((ea.dimensions->>'application')::numeric)::int END AS application_score,
  CASE WHEN jsonb_typeof(ea.dimensions->'communication') = 'number' THEN round((ea.dimensions->>'communication')::numeric)::int END AS communication_score,
  CASE WHEN jsonb_typeof(ea.dimensions->'problemSolving') = 'number' THEN round((ea.dimensions->>'problemSolving')::numeric)::int END AS problem_solving_score,
  CASE WHEN jsonb_typeof(ea.dimensions->'professionalism') = 'number' THEN round((ea.dimensions->>'professionalism')::numeric)::int END AS professionalism_score,
  ea.created_at::date        AS attempted_on
FROM examiner_attempts ea
JOIN users u ON u.id = ea.user_id AND u.role = 'sme';

-- ai.notification: one row per in-app notification sent to a learner. The
-- kind only: no title, body or link.
CREATE VIEW ai.notification AS
SELECT
  n.id                       AS notification_id,
  n.user_id                  AS learner_id,
  n.type                     AS notification_type,
  n.created_at::date         AS sent_on,
  (n.read_at IS NOT NULL)    AS is_read,
  n.read_at::date            AS read_on
FROM notifications n
JOIN users u ON u.id = n.user_id AND u.role = 'sme';

/* ------------------------------------------------------------------ */
/* Mentors                                                             */
/* ------------------------------------------------------------------ */

-- ai.mentor: one row per mentor account (users.role = 'mentor'). No name,
-- email, bio, photo, company, LinkedIn, rate or meeting link. Expertise comes
-- from the mentor's most recent application.
CREATE VIEW ai.mentor AS
SELECT
  u.id                                      AS mentor_id,
  ai.country_name(u.country)                AS country,
  u.created_at::date                        AS joined_on,
  ai.expertise_list(r.expertise)            AS expertise,
  (SELECT count(*)::int
     FROM mentor_availability_slots s
    WHERE s.mentor_user_id = u.id AND s.is_available AND s.starts_at > now()) AS upcoming_open_slots
FROM users u
LEFT JOIN LATERAL (
  SELECT mr.expertise
  FROM mentor_registrations mr
  WHERE mr.user_id = u.id
  ORDER BY mr.created_at DESC
  LIMIT 1
) r ON true
WHERE u.role = 'mentor';

-- ai.mentor_expertise: one row per mentor per expertise area (long form of
-- ai.mentor.expertise, for grouping). Spellings that differ only in case
-- fold to the most common one ("leadership" -> "Leadership").
CREATE VIEW ai.mentor_expertise AS
WITH raw AS (
  SELECT u.id AS mentor_id, trim(e.area) AS area
  FROM users u
  JOIN mentor_registrations mr ON mr.user_id = u.id
  CROSS JOIN LATERAL unnest(mr.expertise) AS e(area)
  WHERE u.role = 'mentor' AND trim(e.area) <> ''
),
canonical AS (
  SELECT DISTINCT ON (lower(area)) lower(area) AS k, area
  FROM raw
  GROUP BY lower(area), area
  ORDER BY lower(area), count(*) DESC, (area = upper(area)), area
)
SELECT DISTINCT
  r.mentor_id                AS mentor_id,
  c.area                     AS expertise
FROM raw r
JOIN canonical c ON c.k = lower(r.area);

-- ai.mentor_application: one row per mentor application. No name, email,
-- LinkedIn, rate or motivation text.
CREATE VIEW ai.mentor_application AS
SELECT
  mr.id                                  AS application_id,
  mr.status                              AS status,
  mr.created_at::date                    AS applied_on,
  ai.expertise_list(mr.expertise)        AS expertise,
  (mr.user_id IS NOT NULL)               AS has_mentor_account
FROM mentor_registrations mr;

-- ai.mentor_session: one row per mentoring session a learner booked. No
-- meeting link and no mentor notes.
CREATE VIEW ai.mentor_session AS
SELECT
  ms.id                                                         AS session_id,
  ms.mentor_user_id                                             AS mentor_id,
  ms.sme_user_id                                                AS learner_id,
  ms.status                                                     AS status,
  ms.booked_at::date                                            AS booked_on,
  s.starts_at                                                   AS starts_at,
  round(extract(epoch FROM (s.ends_at - s.starts_at)) / 60)::int AS duration_minutes,
  ms.cancelled_by                                               AS cancelled_by,
  ms.cancelled_at::date                                         AS cancelled_on,
  ai.expertise_list(r.expertise)                                AS mentor_expertise
FROM mentor_sessions ms
JOIN mentor_availability_slots s ON s.id = ms.slot_id
JOIN users u ON u.id = ms.sme_user_id AND u.role = 'sme'
LEFT JOIN LATERAL (
  SELECT mr.expertise
  FROM mentor_registrations mr
  WHERE mr.user_id = ms.mentor_user_id
  ORDER BY mr.created_at DESC
  LIMIT 1
) r ON true;

/* ------------------------------------------------------------------ */
/* Events, announcements, offers, organisations, stakeholders          */
/* ------------------------------------------------------------------ */

-- ai.live_event: one row per live event, drafts included. No description,
-- meeting, Zoom or recording link, location, passcode or cover image.
CREATE VIEW ai.live_event AS
SELECT
  e.id                                              AS event_id,
  e.title                                           AS title,
  e.type                                            AS event_type,
  e.format                                          AS event_format,
  (e.starts_at AT TIME ZONE e.timezone)::date       AS event_on,
  e.starts_at                                       AS starts_at,
  round(extract(epoch FROM (e.ends_at - e.starts_at)) / 60)::int AS duration_minutes,
  e.capacity                                        AS capacity,
  e.status::text                                    AS status,
  (nullif(trim(e.recording_link), '') IS NOT NULL)  AS has_recording,
  e.created_at::date                                AS created_on
FROM live_events e;

-- ai.event_booking: one row per learner booking (RSVP) for a live event.
CREATE VIEW ai.event_booking AS
SELECT
  r.event_id                 AS event_id,
  r.user_id                  AS learner_id,
  r.created_at::date         AS booked_on
FROM event_rsvps r
JOIN users u ON u.id = r.user_id AND u.role = 'sme';

-- ai.event_attendance: one row per learner who joined a Zoom event, from
-- Zoom's participant report. Attendees Zoom could not match to a learner
-- account are not included (their only identifiers are a name and email).
CREATE VIEW ai.event_attendance AS
SELECT
  a.event_id                 AS event_id,
  a.user_id                  AS learner_id,
  a.first_joined_at::date    AS attended_on,
  a.minutes                  AS minutes_attended
FROM event_attendance a
JOIN users u ON u.id = a.user_id AND u.role = 'sme';

-- ai.announcement: one row per announcement. No body or link.
CREATE VIEW ai.announcement AS
SELECT
  an.id                      AS announcement_id,
  an.title                   AS title,
  an.audience                AS audience,
  an.status                  AS status,
  an.show_banner             AS shown_as_banner,
  an.notify                  AS sent_as_notification,
  an.email                   AS emailed,
  an.starts_at::date         AS starts_on,
  an.ends_at::date           AS ends_on,
  an.audience_size           AS audience_size,
  (an.archived_at IS NOT NULL) AS archived,
  an.created_at::date        AS created_on
FROM announcements an;

-- ai.announcement_seen: one row per learner who saw an announcement.
CREATE VIEW ai.announcement_seen AS
SELECT
  v.announcement_id          AS announcement_id,
  v.user_id                  AS learner_id,
  v.seen_at::date            AS seen_on
FROM announcement_views v
JOIN users u ON u.id = v.user_id AND u.role = 'sme';

-- ai.offer: one row per partner offer in the marketplace.
CREATE VIEW ai.offer AS
SELECT
  o.id                                  AS offer_id,
  o.title                               AS title,
  o.category                            AS category,
  o.status                              AS status,
  round(o.price / 100.0, 2)             AS price_usd,
  o.points_cost                         AS points_cost,
  (o.price = 0)                         AS is_free,
  o.created_at::date                    AS created_on
FROM offers o;

-- ai.offer_redemption: one row per offer a learner redeemed. No billing
-- name, email, phone, company, country or notes, and no Stripe id.
CREATE VIEW ai.offer_redemption AS
SELECT
  r.id                                  AS redemption_id,
  r.user_id                             AS learner_id,
  r.offer_id                            AS offer_id,
  r.points_deducted                     AS points_spent,
  round(r.amount_charged / 100.0, 2)    AS amount_usd,
  r.order_status                        AS order_status,
  r.redeemed_at::date                   AS redeemed_on
FROM offer_redemptions r
JOIN users u ON u.id = r.user_id AND u.role = 'sme';

-- ai.organisation: one row per partner organisation. No name and no join
-- code (an organisation name can identify a small business or its owner).
CREATE VIEW ai.organisation AS
SELECT
  o.id                       AS organisation_id,
  o.type                     AS organisation_type,
  o.join_enabled             AS joining_open,
  (o.archived_at IS NOT NULL) AS archived,
  o.created_at::date         AS created_on
FROM organisations o;

-- ai.stakeholder_registration_month: one row per stakeholder type per
-- calendar month with at least one registration. Aggregated on purpose: a
-- stakeholder row is a named person at a named organisation.
CREATE VIEW ai.stakeholder_registration_month AS
SELECT
  s.type                                  AS stakeholder_type,
  date_trunc('month', s.created_at)::date AS registration_month,
  count(*)::int                           AS registrations
FROM stakeholder_registrations s
GROUP BY s.type, date_trunc('month', s.created_at);

/* ------------------------------------------------------------------ */
/* Grants: re-issued so applying this file leaves the read-only role    */
/* able to read every view, whether or not the role script ran first.   */
/* ------------------------------------------------------------------ */
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hadafi_ai_readonly') THEN
    GRANT USAGE ON SCHEMA ai TO hadafi_ai_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA ai TO hadafi_ai_readonly;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai TO hadafi_ai_readonly;
  END IF;
END $$;
