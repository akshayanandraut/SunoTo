insert into public.app_config(key,value)
values ('virtual','{"enabled":false,"provider":"disabled","model":"","maxConcurrent":0,"fallbackSeconds":15,"greetProbability":0.55,"greetings":["hi","hie","hey"],"personas":[{"personaId":"quiet-river","handle":"QuietRiver482","age":24,"gender":"Other","region":"India","languages":["English","Hindi / Hinglish"],"interests":["Music","Movies"],"tone":"casual and warm","verbosity":"short","curiosity":0.7,"humor":0.4,"delayMinMs":600,"delayMaxMs":1600,"activeHours":[]}]}'::jsonb)
on conflict (key) do nothing;
