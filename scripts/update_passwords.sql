UPDATE users 
SET password_hash = 'pbkdf2-sha256$100000$-ADAttzdnE9aaOGfL68CFg$AZWuAo-Bv_MGqwI7ADcSmPTMBaVdNg5IkkAaH_6ABGM', 
    is_active = 1, 
    account_status = 'active' 
WHERE email IN ('admin@scheduler.pro', 'coordinador@kine.edu', 'davidtroncosop@gmail.com');

INSERT OR REPLACE INTO users (id, email, name, password_hash, role, career_id, is_active, account_status)
VALUES ('usr-david-admin', 'davidtroncosop@gmail.com', 'David Troncoso', 'pbkdf2-sha256$100000$-ADAttzdnE9aaOGfL68CFg$AZWuAo-Bv_MGqwI7ADcSmPTMBaVdNg5IkkAaH_6ABGM', 'admin', NULL, 1, 'active');
