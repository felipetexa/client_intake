import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

const getUploadDir = (intakeId: string) => {
  const dir = path.join(process.cwd(), '/uploads', `intake-${intakeId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const parseForm = (req: NextApiRequest, form: InstanceType<typeof formidable.IncomingForm>) => {
  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err: Error | null, fields: formidable.Fields, files: formidable.Files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return Response.json({ message: 'Method not allowed' }, { status: 405 });
  }

  const intakeId = Array.isArray(req.headers['intake-id'])
    ? req.headers['intake-id'][0]
    : req.headers['intake-id'] || Date.now().toString();

  const uploadDir = getUploadDir(intakeId);

  const form = formidable({
    multiples: true,
    uploadDir,
    keepExtensions: true,
    filename: (name, ext, part) => part.originalFilename || 'unknown_filename',
  });

  try {
    const { files } = await parseForm(req, form);
    const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files];

    return res.status(200).json({
      message: 'Files uploaded successfully',
      intakeId,
      files: uploadedFiles.map((f) => ({
        name: f?.originalFilename || 'unknown',
        path: f?.filepath || '',
        size: f?.size || 0,
        type: f?.mimetype || 'unknown',
      })),
    });
  } catch (err) {
    console.error('Error parsing form:', err);
    return res.status(500).json({ message: 'Error parsing form data' });
  }
}
