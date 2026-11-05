-- MRS results have arrived (Mesa Feedback page, imported 2026-11-05) as section marks per course. The cohort high
-- of 79 the member gave is for the MRS total out of 100; applying it as a ceiling to a section's share of its
-- maximum would inflate that section, so it is kept as context in the note and no longer used as a scale.
update public.course_context
set scale_max = null, expected = '',
    note = 'Mesa Readiness Score: first-principles thinking and problem-solving. Section marks imported from the Mesa Feedback page. Cohort high for the MRS total: 79 (as told by the member; applies to the total, not to sections).'
where assessed_by = 'MRS';
