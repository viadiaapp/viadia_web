export interface UnsplashPhotoResult {
  unsplashPhotoId: string;
  imageUrl: string;
  imageUrlSmall: string;
  photographerName: string | null;
  photographerUsername: string | null;
  photographerProfileUrl: string | null;
  unsplashPhotoUrl: string | null;
  downloadLocation: string | null;
  width: number | null;
  height: number | null;
  altDescription: string | null;
  blurHash: string | null;
}

// Searches Unsplash for a photo representing the given place and returns the first, most
// relevant result. Returns null (rather than throwing) when nothing matches, since a missing
// image shouldn't block the rest of destination content generation.
export async function searchUnsplashPhoto(placeName: string, countryName: string): Promise<UnsplashPhotoResult | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured on the server.");
  }

  const query = encodeURIComponent(`${placeName} ${countryName}`);
  const res = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unsplash API error ${res.status}: ${text}`);
  }
  const data: any = await res.json();
  const photo = data?.results?.[0];
  if (!photo) return null;

  return {
    unsplashPhotoId: photo.id,
    imageUrl: photo.urls?.regular || photo.urls?.full || "",
    imageUrlSmall: photo.urls?.small || photo.urls?.thumb || "",
    photographerName: photo.user?.name || null,
    photographerUsername: photo.user?.username || null,
    photographerProfileUrl: photo.user?.links?.html || null,
    unsplashPhotoUrl: photo.links?.html || null,
    downloadLocation: photo.links?.download_location || null,
    width: typeof photo.width === "number" ? photo.width : null,
    height: typeof photo.height === "number" ? photo.height : null,
    altDescription: photo.alt_description || null,
    blurHash: photo.blur_hash || null,
  };
}

// Unsplash's API guidelines require pinging the photo's download_location endpoint whenever
// it's actually used/displayed to a user, separately from the search call that found it.
// Best-effort: a failed ping shouldn't block anything the caller is doing.
export async function triggerUnsplashDownload(downloadLocation: string): Promise<void> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !downloadLocation) return;
  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch (err: any) {
    console.warn("Unsplash download-tracking ping failed (non-blocking):", err?.message || err);
  }
}
