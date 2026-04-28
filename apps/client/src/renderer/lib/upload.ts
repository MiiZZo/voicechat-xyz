import { LOBBY_URL } from './env.js';

export type UploadResponse = {
  id: string;
  url: string;
  name: string;
  size: number;
  mime: string;
};

export type UploadHandle = {
  promise: Promise<UploadResponse>;
  abort: () => void;
};

/** Upload via XHR so we can report progress events. Aborts cancel the request. */
export function uploadFile(args: {
  roomId: string;
  token: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open('POST', `${LOBBY_URL}/api/uploads/${encodeURIComponent(args.roomId)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${args.token}`);

    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable && args.onProgress) {
        args.onProgress(evt.loaded / evt.total);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch (e) {
          reject(new Error(`bad response: ${(e as Error).message}`));
        }
      } else if (xhr.status === 413) {
        reject(new Error('Файл слишком большой (макс. 50 МБ)'));
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error('Нет доступа к загрузке'));
      } else {
        reject(new Error(`Ошибка загрузки (${xhr.status})`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Сеть недоступна')));
    xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')));

    const form = new FormData();
    form.append('file', args.file, args.file.name);
    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}
