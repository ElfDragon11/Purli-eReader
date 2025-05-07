import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export const extractCover = async (file: File): Promise<Blob | null> => {
  const zip = await JSZip.loadAsync(file);

  // Step 1: Read container.xml to find path to content.opf
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) return null;

  const parser = new XMLParser({ ignoreAttributes: false });
  const container = parser.parse(containerXml);
  const rootfilePath = container.container.rootfiles.rootfile['@_full-path'];

  // Step 2: Read content.opf
  const opfXml = await zip.file(rootfilePath)?.async('string');
  if (!opfXml) return null;

  const opf = parser.parse(opfXml);
  const metadata = opf.package.metadata;
  const manifest = Array.isArray(opf.package.manifest.item)
    ? opf.package.manifest.item
    : [opf.package.manifest.item];

  // Step 3: Find the cover ID
  const coverMeta = Array.isArray(metadata.meta)
    ? metadata.meta.find((m: any) => m['@_name'] === 'cover')
    : metadata.meta?.['@_name'] === 'cover'
      ? metadata.meta
      : null;

  const coverId = coverMeta?.['@_content'];
  if (!coverId) return null;

  // Step 4: Find the manifest item with that ID
  const coverItem = manifest.find((item: any) => item['@_id'] === coverId);
  const href = coverItem?.['@_href'];
  if (!href) return null;

  // Step 5: Read the cover image file from the ZIP
  const basePath = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1);
  const imagePath = basePath + href;
  const imageFile = zip.file(imagePath);
  if (!imageFile) return null;

  const imageBlob = await imageFile.async('blob');
  return imageBlob;
};