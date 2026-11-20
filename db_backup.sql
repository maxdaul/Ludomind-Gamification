-- Ludomind test data. Initialize the application schema using scripts/restore_demo_db.py.
--
-- PostgreSQL database dump
--


-- Dumped from database version 13.23 (Debian 13.23-1.pgdg13+1)
-- Dumped by pg_dump version 13.23 (Debian 13.23-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: competitions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.competitions (id, title, start_date, end_date, created_at, updated_at) VALUES
	(1, 'Ирниту марафон 2025', '2025-06-01 00:00:00', '2025-08-31 23:59:59', '2026-11-17 21:58:22.739134', '2026-11-17 21:58:22.739134'),
	(2, 'Кучка умников', '2025-01-15 00:00:00', '2025-03-15 23:59:59', '2026-11-17 21:58:22.739134', '2026-11-17 21:58:22.739134'),
	(3, 'Майский марафон', '2025-04-20 00:00:00', '2025-05-31 23:59:59', '2026-11-17 21:58:22.739134', '2026-11-17 21:58:22.739134');


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.departments (id, name) VALUES
	(1, 'Ангар');


--
-- Data for Name: positions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.positions (id, name) VALUES
	(1, 'Сгибатель пружин');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, first_name, last_name, username, email, password_hash, moodle_id, role, created_at, updated_at, manager_id, position_id, department_id) VALUES
	(3, 'u2_name', 'u2_lastname', 'u2', 'u2@user.com', '$2b$12$2DeVwvKbDD0tinT5nvj8mOuGTddbk./TXZHlP5K/j.j7ZBshDu3.6', 18, 'user', '2026-11-17 21:58:21.758725', '2026-11-17 21:58:21.758725', NULL, NULL, NULL),
	(4, 'sss', 'ssss', 'sss', 'sss@ss.s', '$2b$12$FgYa91a5Fw0/rlVU//Zd9uPpS75mSCfVGUjDMhZhU.jJIIsF637q.', 16, 'admin', '2026-11-17 21:58:21.758725', '2026-11-17 21:58:21.758725', NULL, NULL, NULL),
	(1, 'Admin', 'Admin', 'admin', 'admin@admin.com', '$2b$12$2dVFXKk9lgFj/hBi5qpcl.iO5uAiHvpZs6YatW2cl5NFduGntDmsG', 2, 'admin', '2026-11-17 21:58:21.758725', '2026-11-17 21:58:21.758725', NULL, NULL, NULL),
	(5, 'Анна', 'Иванова', 'manager', 'manager@work.com', '$2b$12$dz9LCYyGTtg..4ZYeAbwXu6m/JEG4jlVKdfWAgAibE67u4B0XPVoO', 15, 'manager', '2026-11-17 21:58:21.758725', '2026-11-17 21:58:21.758725', NULL, NULL, NULL),
	(2, 'u1_name', 'u1_lastname', 'u1', 'wotblitz1191@gmail.com', '$2b$12$3aENOdy1z8H27.hZGZHGnuboOxJYAfXgZxx8ubkqUL5dMuBfSapGO', 17, 'user', '2026-11-17 21:58:21.758725', '2026-11-18 18:02:24.325429', 5, NULL, NULL),
	(6, 'Дмитрий', 'Сидоров', 'dmitry', 'dmitry@work.com', '$2b$12$CgwiqwRTKd8Al10wzR49ROw43IckMJP9dpzAcfqn8HmmjosSHOwJ2', 19, 'user', '2026-11-17 21:58:21.758725', '2026-11-20 22:57:30.920843', NULL, 1, 1);


--
-- Data for Name: participants; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: reward_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.reward_types (id, code, name, description) VALUES
	(1, 'bonus1', 'bonus1', NULL),
	(2, 'bonus2', 'bonus2', NULL),
	(3, 'bonus3', 'bonus3', NULL);


--
-- Data for Name: rewards; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tags (id, name) VALUES
	(1, 'SoftSkills'),
	(2, 'HardSkills'),
	(3, 'Creativity'),
	(4, 'Management');


--
-- Data for Name: task_status; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.task_status (id, code, name) VALUES
	(1, 'todo', 'К выполнению'),
	(2, 'in_progress', 'В работе'),
	(3, 'hold done', 'Ожидает подтверждения'),
	(4, 'done', 'Выполнено'),
	(5, 'wasted', 'Просрочено');


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: task_deadline_notifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: task_tags; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: competitions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.competitions_id_seq', 9, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 1, true);


--
-- Name: participants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.participants_id_seq', 4, true);


--
-- Name: positions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.positions_id_seq', 1, true);


--
-- Name: reward_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reward_types_id_seq', 3, true);


--
-- Name: rewards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rewards_id_seq', 13, true);


--
-- Name: tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tags_id_seq', 4, true);


--
-- Name: task_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.task_status_id_seq', 5, true);


--
-- Name: tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tasks_id_seq', 51, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 23, true);


--
-- PostgreSQL database dump complete
--
