import { safeDriveSourceUrl } from '@/lib/drive-sync/source-url';
export function MaterialProvenance({ name, version, sourceKind, extractionStatus, driveFileId, sourceUrl, current, available }: {
    name: string;
    version: number;
    sourceKind: string;
    extractionStatus: string;
    driveFileId?: string;
    sourceUrl?: string;
    current?: boolean;
    available?: boolean;
}) {
    const href = driveFileId && sourceUrl ? safeDriveSourceUrl(driveFileId, sourceUrl) : null;
    return <span><strong>{name}</strong><small>v{version} · {sourceKind.replaceAll('_', ' ')} · {extractionStatus.replaceAll('_', ' ')}{current === false ? ' · Historical version' : ''}{available === false ? ' · Source unavailable' : ''}</small>{href ? <a href={href} target="_blank" rel="noreferrer" referrerPolicy="no-referrer">Original Drive source</a> : null}</span>;
}
