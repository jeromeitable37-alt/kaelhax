import { auth } from './firebase';

async function authHeaders() {
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in first.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function uploadToCloudinary(file, folder) {
  if (!file) throw new Error('Please choose an image.');

  const headers = await authHeaders();
  const signatureResponse = await fetch(
    `/api/cloudinary?action=signature&folder=${encodeURIComponent(folder)}`,
    { headers }
  );
  const signatureData = await signatureResponse.json().catch(() => null);

  if (!signatureResponse.ok || !signatureData?.ok) {
    throw new Error(signatureData?.error || `Could not prepare Cloudinary upload (HTTP ${signatureResponse.status}).`);
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signatureData.apiKey);
  form.append('timestamp', String(signatureData.timestamp));
  form.append('signature', signatureData.signature);
  form.append('folder', signatureData.folder);
  if (signatureData.publicIdPrefix) form.append('public_id_prefix', signatureData.publicIdPrefix);
  form.append('tags', signatureData.tags || 'kaelhax');

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signatureData.cloudName)}/image/upload`,
    { method: 'POST', body: form }
  );
  const uploadData = await uploadResponse.json().catch(() => null);

  if (!uploadResponse.ok || !uploadData?.secure_url) {
    throw new Error(uploadData?.error?.message || `Cloudinary upload failed (HTTP ${uploadResponse.status}).`);
  }

  return {
    secureUrl: uploadData.secure_url,
    publicId: uploadData.public_id,
    width: uploadData.width,
    height: uploadData.height,
    format: uploadData.format,
    bytes: uploadData.bytes,
  };
}

export async function getCloudinaryImages(search = '') {
  const headers = await authHeaders();
  const response = await fetch(`/api/cloudinary?action=images&search=${encodeURIComponent(search)}`, { headers });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Could not load Cloudinary images (HTTP ${response.status}).`);
  }
  return data.assets || [];
}
