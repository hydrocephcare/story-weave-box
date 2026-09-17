-- Grant admin role to hydrocephcare@gmail.com
DO $$
DECLARE
    target_user_id uuid;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = 'hydrocephcare@gmail.com';
    
    IF target_user_id IS NOT NULL THEN
        -- Insert into user_roles if not already there
        INSERT INTO public.user_roles (user_id, role)
        VALUES (target_user_id, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Insert into access_grants for full paid access
        INSERT INTO public.access_grants (
            code, 
            plan, 
            expires_at, 
            amount, 
            allow_download, 
            email, 
            user_id
        )
        VALUES (
            'ADMIN-ACCESS', 
            'annual', 
            '2099-01-01 00:00:00+00', 
            0, 
            true, 
            'hydrocephcare@gmail.com', 
            target_user_id
        )
        ON CONFLICT (user_id) DO UPDATE 
        SET 
            expires_at = EXCLUDED.expires_at,
            allow_download = EXCLUDED.allow_download,
            plan = EXCLUDED.plan;
    END IF;
END $$;
