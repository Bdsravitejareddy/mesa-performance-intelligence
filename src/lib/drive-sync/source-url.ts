/** Only the matching canonical Drive file URL and optional Google resource key are navigable. */
export function safeDriveSourceUrl(id: string, raw: string): string | null {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(id))
        return null;
    const canonical = `https://drive.google.com/file/d/${id}/view`;
    if (raw === canonical)
        return raw;
    try {
        const url = new URL(raw), keys = [...url.searchParams.keys()];
        if (url.origin !== 'https://drive.google.com' || url.username || url.password || url.pathname !== `/file/d/${id}/view` || url.hash || keys.length !== 1 || keys[0] !== 'resourcekey' || !/^[A-Za-z0-9_-]{1,256}$/.test(url.searchParams.get('resourcekey') ?? ''))
            return null;
        return `${canonical}?resourcekey=${url.searchParams.get('resourcekey')}`;
    }
    catch {
        return null;
    }
}
