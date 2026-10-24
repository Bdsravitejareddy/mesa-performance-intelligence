-- Course outlines read from Nexus are stored as the plain text of their linked sheet (one page per tab), so the
-- private course-files bucket also accepts text/plain. Every other rule on the bucket is unchanged.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
where id = 'course-files';
