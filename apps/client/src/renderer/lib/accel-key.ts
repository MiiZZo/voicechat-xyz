// Преобразование KeyboardEvent в accelerator-строку для Tauri global-shortcut.
// Вынесено отдельно от apps/client-tauri/src/global-shortcuts.ts, чтобы
// SettingsModal (общий renderer) мог захватывать комбинации без импорта
// Tauri-специфичных пакетов.

/** Формат — accelerator Tauri 2: "CommandOrControl+Shift+M". Минимум один
 *  модификатор обязателен — без него global-shortcut перехватывал бы
 *  обычные одиночные нажатия (например "M") во всей системе. Возвращает
 *  null если основная клавиша не поддерживается или модификаторов нет. */
export function accelFromKeyEvent(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (parts.length === 0) return null;

  const code = e.code;
  let key: string | null = null;
  if (code.startsWith('Key')) key = code.slice(3); // KeyM → M
  else if (code.startsWith('Digit')) key = code.slice(5); // Digit1 → 1
  else if (/^F\d{1,2}$/.test(code)) key = code; // F1..F24
  else if (code === 'Space') key = 'Space';
  else if (code === 'Tab') key = 'Tab';
  else if (code === 'Enter') key = 'Enter';
  else if (code === 'Escape') key = 'Escape';
  else if (code === 'ArrowUp') key = 'Up';
  else if (code === 'ArrowDown') key = 'Down';
  else if (code === 'ArrowLeft') key = 'Left';
  else if (code === 'ArrowRight') key = 'Right';
  else if (code === 'Backspace') key = 'Backspace';
  else if (code === 'Delete') key = 'Delete';
  else if (code === 'Home') key = 'Home';
  else if (code === 'End') key = 'End';
  if (!key) return null;
  parts.push(key);
  return parts.join('+');
}

/** Человекочитаемое представление accelerator'а: "CommandOrControl+Shift+M"
 *  → "Ctrl+Shift+M" (на Windows/Linux). Используется только для отображения
 *  в Settings — внутрь Tauri отправляем оригинал. */
export function prettyAccel(accel: string): string {
  return accel
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/\+/g, ' + ');
}
