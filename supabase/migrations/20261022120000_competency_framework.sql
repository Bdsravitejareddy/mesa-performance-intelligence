-- Shared, extensible competency taxonomy. Reference data: readable by members, changed only through migrations.
create table public.competencies (
  id text primary key check (id ~ '^[a-z_]+\.[a-z_]+$'),
  domain_key text not null check (domain_key ~ '^[a-z_]+$'),
  domain_name text not null check (length(trim(domain_name)) > 0),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (split_part(id, '.', 1) = domain_key)
);
alter table public.competencies enable row level security;
revoke all on public.competencies from public, anon, authenticated;
grant select on public.competencies to authenticated;
create policy competencies_members_read on public.competencies
for select to authenticated
using ((select auth.uid()) in (select private.mesa_workspace_member_ids()));

insert into public.competencies (id, domain_key, domain_name, name, description, sort_order) values
  ('analytical.numerical_analysis','analytical','Analytical reasoning','Numerical analysis','Accurate calculation, estimation and interpretation of quantitative data.',101),
  ('analytical.logical_reasoning','analytical','Analytical reasoning','Logical reasoning','Valid inference from stated premises and evidence.',102),
  ('analytical.structured_problem_solving','analytical','Analytical reasoning','Structured problem-solving','Breaking a problem into exhaustive, non-overlapping parts and working through them.',103),
  ('business.strategy','business','Business acumen','Strategy','Competitive positioning, choices and their rationale.',201),
  ('business.finance','business','Business acumen','Finance','Financial statements, valuation, unit economics and capital decisions.',202),
  ('business.economics','business','Business acumen','Economics','Markets, incentives, pricing and macro context.',203),
  ('business.business_models','business','Business acumen','Business models','How a business creates, delivers and captures value.',204),
  ('execution.operations','execution','Execution','Operations','Designing and running processes, capacity and supply.',301),
  ('execution.implementation','execution','Execution','Implementation','Turning a plan into delivered outcomes.',302),
  ('execution.prioritisation','execution','Execution','Prioritisation','Sequencing work by impact, effort and constraints.',303),
  ('communication.clarity','communication','Communication','Clarity','Precise, well-structured written and spoken communication.',401),
  ('communication.persuasion','communication','Communication','Persuasion','Building a case that moves a specific audience.',402),
  ('communication.storytelling','communication','Communication','Storytelling','Narrative that connects evidence to a conclusion.',403),
  ('communication.stakeholder_management','communication','Communication','Stakeholder management','Aligning people with different interests.',404),
  ('leadership.ownership','leadership','Leadership','Ownership','Taking responsibility for outcomes.',501),
  ('leadership.collaboration','leadership','Leadership','Collaboration','Working effectively with others towards a shared goal.',502),
  ('leadership.conflict_resolution','leadership','Leadership','Conflict resolution','Resolving disagreement productively.',503),
  ('technical.sql','technical','Technical capability','SQL','Querying and modelling relational data.',601),
  ('technical.python','technical','Technical capability','Python','Programming for analysis and automation.',602),
  ('technical.analytics','technical','Technical capability','Analytics','Metrics, dashboards and data-driven analysis.',603),
  ('technical.ai','technical','Technical capability','AI','Applying AI and machine-learning tools appropriately.',604),
  ('technical.systems_understanding','technical','Technical capability','Systems understanding','How technical systems fit together and fail.',605),
  ('product.discovery','product','Product thinking','Discovery','Finding and validating problems worth solving.',701),
  ('product.customer_needs','product','Product thinking','Customer needs','Understanding users and their jobs to be done.',702),
  ('product.prioritisation','product','Product thinking','Product prioritisation','Choosing what to build and what not to.',703),
  ('product.metrics','product','Product thinking','Product metrics','Defining and using measures of product success.',704),
  ('decision.judgement','decision','Decision-making','Judgement','Sound conclusions under ambiguity.',801),
  ('decision.risk_assessment','decision','Decision-making','Risk assessment','Identifying and weighing downside scenarios.',802),
  ('decision.trade_offs','decision','Decision-making','Trade-offs','Explicitly comparing options and their costs.',803),
  ('creativity.innovation','creativity','Creativity','Innovation','Generating novel, useful ideas.',901),
  ('creativity.hypothesis_generation','creativity','Creativity','Hypothesis generation','Forming testable explanations.',902),
  ('creativity.unconventional_solutions','creativity','Creativity','Unconventional solutions','Solving problems in non-obvious ways.',903),
  ('learning.feedback_integration','learning','Learning agility','Feedback integration','Acting on feedback in later work.',1001),
  ('learning.adaptation','learning','Learning agility','Adaptation','Adjusting approach when conditions change.',1002),
  ('learning.knowledge_transfer','learning','Learning agility','Knowledge transfer','Applying learning in a new context.',1003);

-- Which competencies an assessment provides evidence for. Inherits the assessment owner through the composite foreign key.
create table public.assessment_competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null,
  competency_id text not null references public.competencies(id),
  mapping_source text not null check (mapping_source in ('user_tagged','official_rubric','learning_objective','ai_suggested')),
  review_status text not null default 'accepted' check (review_status in ('suggested','accepted','rejected')),
  rationale text not null default '' check (length(rationale) <= 1000),
  tagged_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, competency_id),
  foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade,
  -- AI suggestions never count as evidence until a member accepts them.
  check (mapping_source <> 'ai_suggested' or review_status <> 'accepted' or length(trim(rationale)) > 0)
);
create index assessment_competencies_competency_idx on public.assessment_competencies(competency_id);
alter table public.assessment_competencies enable row level security;
revoke all on public.assessment_competencies from public, anon, authenticated;
grant select, insert, update, delete on public.assessment_competencies to authenticated;
create policy workspace_access on public.assessment_competencies
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
