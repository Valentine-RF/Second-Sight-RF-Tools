import { db } from './server/db';
import { signalCaptures } from './drizzle/schema';

async function main() {
  // Query all captures
  const captures = await db.select().from(signalCaptures).limit(5);

  console.log('Found captures:', captures.length);

  for (const capture of captures) {
    console.log('\n---');
    console.log('ID:', capture.id);
    console.log('Name:', capture.name);
    console.log('Data File URL:', capture.dataFileUrl);
    console.log('Meta File URL:', capture.metaFileUrl);
    
    // Test if URL is accessible
    if (capture.dataFileUrl) {
      try {
        const response = await fetch(capture.dataFileUrl, { method: 'HEAD' });
        console.log('Data file accessible:', response.ok, 'Status:', response.status);
        console.log('Content-Length:', response.headers.get('content-length'));
      } catch (error: any) {
        console.log('Error fetching data file:', error.message);
      }
    }
  }

  process.exit(0);
}

main();
