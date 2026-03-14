const DB_NAME = 'FlowStudioMediaDB'
const STORE_NAME = 'mediaFiles'
const DB_VERSION = 1

interface MediaRecord {
  path: string
  file: Blob | File
  timestamp: number
}

// Helper to open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'path' })
      }
    }
  })
}

export interface UploadResult {
  path: string
  url: string
}

// Upload a media file to IndexedDB
export async function uploadMediaFile(
  projectId: string,
  file: File
): Promise<{ data: UploadResult | null; error: Error | null }> {
  try {
    const db = await openDB()
    const fileExt = file.name.split('.').pop()
    const uniqueId = crypto.randomUUID()
    
    // Create a local path identifier
    const path = `local_user/${projectId}/${uniqueId}.${fileExt}`

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const record: MediaRecord = {
        path,
        file,
        timestamp: Date.now()
      }

      const request = store.put(record)

      request.onsuccess = () => {
        // Create an object URL for immediate use
        const url = URL.createObjectURL(file)
        resolve({
          data: { path, url },
          error: null
        })
      }

      request.onerror = () => {
        resolve({ data: null, error: new Error('Failed to store file in IndexedDB') })
      }
    })
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Download a media file from IndexedDB (returns blob URL)
export async function getMediaFileUrl(path: string): Promise<{ url: string | null; error: Error | null }> {
  try {
    const db = await openDB()

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(path)

      request.onsuccess = () => {
        if (request.result) {
          const record = request.result as MediaRecord
          const url = URL.createObjectURL(record.file)
          resolve({ url, error: null })
        } else {
          resolve({ url: null, error: new Error('File not found') })
        }
      }

      request.onerror = () => {
        resolve({ url: null, error: new Error('Error retrieving file') })
      }
    })
  } catch (error: unknown) {
    return { url: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Delete a media file from IndexedDB
export async function deleteMediaFile(path: string): Promise<{ error: Error | null }> {
  try {
    const db = await openDB()

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(path)

      request.onsuccess = () => resolve({ error: null })
      request.onerror = () => resolve({ error: new Error('Failed to delete file') })
    })
  } catch (error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Delete all media files for a project
export async function deleteProjectMedia(projectId: string): Promise<{ error: Error | null }> {
  try {
    const db = await openDB()
    const prefix = `local_user/${projectId}/`

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          if (cursor.key.toString().startsWith(prefix)) {
            cursor.delete()
          }
          cursor.continue()
        } else {
          resolve({ error: null })
        }
      }

      request.onerror = () => resolve({ error: new Error('Failed to clear project media') })
    })
  } catch (error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}
