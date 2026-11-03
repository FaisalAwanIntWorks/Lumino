# Table → Migration File Reference

| Table Name | Migration File |
|---|---|
| analytics_events | 20251117202023_c4c1a186-d40f-4647-b0ad-d00d8d8f3dd8.sql |
| admin_activity_logs | 20260114172109_8e87810d-0296-4108-a0ac-a267ac5d46fd.sql |
| admin_logging_information | NOT FOUND (table not defined in current migrations) |
| ai_chat_sessions | 20251117225753_ae8e6d6a-bbb4-4cc0-be74-1f1d8e684628.sql |
| ai_chat_messages | 20251117225753_ae8e6d6a-bbb4-4cc0-be74-1f1d8e684628.sql |
| ai_response_cache | 20260318184616_9a718b20-4e9a-4d40-a93b-fe7ba301f5b9.sql |
| ai_training_examples | 20251117220656_0827a0f1-ede1-48d5-abe5-cd6dca4c5840.sql |
| ai_usage_logs | 20260318184616_9a718b20-4e9a-4d40-a93b-fe7ba301f5b9.sql |
| backup_logs | 20251120182245_a40b289f-a526-44fb-b3c9-3794151c28ba.sql |
| client_activity_logs | 20260114081337_8e319ebd-9dee-4647-8e15-96516f1790f2.sql |
| client_notifications | 20260314142503_d83a7303-01d3-4a72-9e4b-d8ca2b1ee184.sql |
| custom_enquiry_leads | 20260218063650_d8123d67-78e0-4d7d-a627-deb68f3212b4.sql |
| custom_enquiry_preview_images | 20260318114129_3fcf2d96-80aa-463c-9412-cc876e095087.sql |
| email_logs | 20260119160757_c4f99339-4730-4812-915a-ee3a635ea345.sql |
| failed_login_attempts | 20260109131020_d182af1c-e028-4def-b997-c9ca999c8c8f.sql |
| grill_preview_images | 20260313133439_57ffe5a4-697d-415b-841a-c119bec04d7a.sql |
| impersonation_sessions | 20251120014626_ad84fc36-bd18-49fa-808e-b8c28fa446d7.sql |
| my_master_db_data_backup | 20260402071612_4607cfe2-d8d2-4a81-9dbc-2c5b779e02f0.sql |
| password_reset_tokens | 20260119160757_c4f99339-4730-4812-915a-ee3a635ea345.sql |
| pending_render_emails | 20260329162020_085f06bc-12d3-4663-988d-0f877447a7d3.sql |
| saved_designs | 20251117210236_fc64729b-04a3-47ef-83d9-fae0e6efe4a0.sql |
| system_errors | 20260121095811_01de17c8-6558-4ee2-97d9-b0dc12e691d7.sql |
| system_error_alerts | 20260121095811_01de17c8-6558-4ee2-97d9-b0dc12e691d7.sql |

**Notes:**
- Listed file = earliest migration containing the `CREATE TABLE` statement. Subsequent migrations may have altered the table.
- `admin_logging_information` has no `CREATE TABLE` migration in `supabase/migrations/` — it likely exists in the database but was created outside the tracked migration history.
- Corrected typos from request: `client-activity_logs` → `client_activity_logs`, `emial_logs` → `email_logs`, `save_designs` → `saved_designs`.
