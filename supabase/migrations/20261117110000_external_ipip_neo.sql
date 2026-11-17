-- A long-form IPIP-NEO result (e.g. the 300-item IPIP-NEO) taken elsewhere and imported from its result PDF: five
-- traits and thirty facets, with the test site's own percentiles and norm group kept as printed. Self-report, like the
-- in-app questionnaire; stored beside 16Personalities and CliftonStrengths.
alter table public.external_assessments drop constraint external_assessments_kind_check;
alter table public.external_assessments add constraint external_assessments_kind_check check (kind in ('16personalities','cliftonstrengths','ipip_neo'));
