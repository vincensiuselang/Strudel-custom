import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

export async function savePatternsTauri(jsonContent, defaultFilename) {
  try {
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'Strudel Patterns',
        extensions: ['json']
      }]
    });

    if (filePath) {
      await writeTextFile(filePath, jsonContent);
      console.log('File saved successfully via Tauri:', filePath);
    } else {
      console.log('Tauri save operation cancelled by the user.');
    }
  } catch (error) {
    console.error('Error saving file via Tauri:', error);
  }
}
