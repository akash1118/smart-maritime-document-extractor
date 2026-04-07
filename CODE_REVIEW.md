```
// src/routes/extract.ts
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const client = new Anthropic({ apiKey: 'sk-ant-REDACTED' }); // Review: API keys should never be hardcoded in source code. ommitting real keys exposes them in Git history. Anyone with repo access (or leaks) can misuse them, leading to security breaches and unexpected billing. Read from ENV variables.

router.post('/extract', async (req, res) => {
  const file = req.file; // Review: No validation on uploaded file. Users could upload Non-image files, Extremely large files, Malicious payloads. This can lead to security vulnerabilities or memory issues.

  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    // Read the file and convert to base64
    const fileData = fs.readFileSync(file.path); // Review: This is a synchronous operation. Node.js is single-threaded. Using readFileSync blocks the entire event loop, meaning other requests cannot be processed while this runs — this will hurt performance under load. Await this function call

    const base64Data = fileData.toString('base64');

    // Save file to disk permanently for reference
    const savedPath = path.join('./uploads', file.originalname); // Review: Files with same name will overwrite each other. Two users uploading document.png → data loss. Use datetime to name files.
    fs.copyFileSync(file.path, savedPath); // Review: Same synchronous call issue here

    const response = await client.messages.create({
      model: 'claude-opus-4-6', // Review: Hardcoded + expensive model. Opus is costly. No flexibility to switch models
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.mimetype,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: 'Extract all information from this maritime document and return as JSON.',
            },
          ],
        },
      ],
    });

    const result = JSON.parse(response.content[0].text); //Review: This assumes the AI always returns valid JSON. LLMs are not guaranteed to return perfectly formatted JSON — even small deviations (extra text, trailing commas) will crash your app here. Hanfle the model output in try catch.

    // Store in memory for now
    global.extractions = global.extractions || []; // Review: Using global state for storing data. Not shared across instances (breaks in scaling). Lost on restart. Can cause memory leaks. Use a proper DB or remove if not needed.
    global.extractions.push(result);

    res.json(result);
  } catch (error) {
    console.log('Error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
```
