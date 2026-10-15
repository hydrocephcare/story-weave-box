-- Starting list of Kenyan universities and colleges that train medical students, for the contest registration form and the per-university links.
-- Safe to run twice. An admin can edit, hide or remove any row in Admin > Contests; students can also add a missing one themselves.
insert into public.contest_universities (name, slug, abbreviation, active, verified)
select v.name, v.slug, v.abbr, true, true
from (values
  ('University of Nairobi', 'university-of-nairobi', 'UoN'),
  ('Kenyatta University', 'kenyatta-university', 'KU'),
  ('Moi University', 'moi-university', 'MU'),
  ('Jomo Kenyatta University of Agriculture and Technology', 'jkuat', 'JKUAT'),
  ('Maseno University', 'maseno-university', 'MSU'),
  ('Egerton University', 'egerton-university', 'EU'),
  ('Mount Kenya University', 'mount-kenya-university', 'MKU'),
  ('Kenya Methodist University', 'kenya-methodist-university', 'KeMU'),
  ('Aga Khan University', 'aga-khan-university', 'AKU'),
  ('University of Eldoret', 'university-of-eldoret', 'UoE'),
  ('Kisii University', 'kisii-university', 'KSU'),
  ('Masinde Muliro University of Science and Technology', 'mmust', 'MMUST'),
  ('Great Lakes University of Kisumu', 'great-lakes-university-of-kisumu', 'GLUK'),
  ('Catholic University of Eastern Africa', 'catholic-university-of-eastern-africa', 'CUEA'),
  ('Kabarak University', 'kabarak-university', 'KABU'),
  ('University of Embu', 'university-of-embu', 'UoEm'),
  ('Jaramogi Oginga Odinga University of Science and Technology', 'jooust', 'JOOUST'),
  ('Pwani University', 'pwani-university', 'PU'),
  ('Kenya Medical Training College', 'kenya-medical-training-college', 'KMTC')
) as v(name, slug, abbr)
where not exists (select 1 from public.contest_universities u where u.slug = v.slug);

-- the first starter list marked these three as unverified
update public.contest_universities set verified = true where slug in ('mount-kenya-university', 'university-of-nairobi', 'kenyatta-university');
