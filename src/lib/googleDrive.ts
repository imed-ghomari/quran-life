
/**
 * Google Drive API Client for appDataFolder
 */

const APP_DATA_FILENAME = 'quran_app_backup.json';

export interface GoogleDriveFile {
  id: string;
  name: string;
}

export async function fetchBackupFile(accessToken: string): Promise<{ data: any; fileId: string | null }> {
  try {
    // 1. Search for the file in appDataFolder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${APP_DATA_FILENAME}'&spaces=appDataFolder&fields=files(id,name)`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!searchRes.ok) {
      throw new Error(`Failed to search for backup file: ${searchRes.statusText}`);
    }

    const searchData = await searchRes.json();
    const file = searchData.files?.[0];

    if (!file) {
      return { data: null, fileId: null };
    }

    // 2. Fetch the file content
    const contentUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const contentRes = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!contentRes.ok) {
      throw new Error(`Failed to fetch backup content: ${contentRes.statusText}`);
    }

    const data = await contentRes.json();
    return { data, fileId: file.id };
  } catch (error) {
    console.error('Error fetching backup from Google Drive:', error);
    throw error;
  }
}

export async function uploadBackupFile(accessToken: string, data: any, fileId: string | null): Promise<string> {
  try {
    const boundary = 'foo_bar_baz';
    const metadata = {
      name: APP_DATA_FILENAME,
      parents: fileId ? undefined : ['appDataFolder'],
    };

    const multipartBody = 
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(data) + `\r\n` +
      `--${boundary}--`;

    const url = fileId 
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to upload backup: ${res.statusText} - ${errorText}`);
    }

    const result = await res.json();
    return result.id;
  } catch (error) {
    console.error('Error uploading backup to Google Drive:', error);
    throw error;
  }
}
