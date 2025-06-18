import mammoth from "mammoth";
import Tesseract from "tesseract.js";
// import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import type { File as FormidableFile } from 'formidable';

export async function parseFileText(file: FormidableFile): Promise<string> {
  const { filepath, mimetype } = file;

  try {
    const buffer = await fs.readFile(filepath);

    if (mimetype === 'application/pdf') {
      try {
        const { default: pdfParse } = await import('pdf-parse');
        const result = await pdfParse(buffer);
        return result.text.slice(0, 2000);
      } catch (err) {
        console.error('📄 PDF parsing failed:', err);
        return 'Note: Unable to extract content from this PDF file.';
      }
    }

    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
      const result = await mammoth.extractRawText({buffer});
      return result.value.slice(0, 2000);
    }

    if (mimetype && mimetype.startsWith('image/')){
      const result = await Tesseract.recognize(filepath, 'eng');
      return result.data.text.slice(0, 2000);
    }

    const content = buffer.toString('utf-8');
    return content.slice(0,2000);
  } catch(err){
    console.error('Error parsing file:', err);
    return '';
  }

}