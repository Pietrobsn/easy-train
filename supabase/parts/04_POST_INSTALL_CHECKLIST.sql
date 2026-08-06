-- EASY TRAIN — CONSULTAS ÚTEIS PÓS-INSTALAÇÃO
-- Rode blocos separados quando precisar. Nada abaixo é obrigatório.

-- Ver perfis criados:
select id, display_name, username, discoverable, account_status, created_at
from easy_train_private.profiles
order by created_at desc;

-- Ver estatísticas calculadas pelo banco:
select p.display_name, p.username, s.*
from easy_train_private.user_stats s
join easy_train_private.profiles p on p.id = s.user_id
order by s.workouts_count desc;

-- Suspender uma conta sem apagá-la (troque o e-mail):
-- update easy_train_private.profiles p
-- set account_status = 'suspended', updated_at = now()
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('email@exemplo.com');

-- Reativar:
-- update easy_train_private.profiles p
-- set account_status = 'active', updated_at = now()
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('email@exemplo.com');
