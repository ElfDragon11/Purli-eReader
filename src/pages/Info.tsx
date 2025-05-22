import React from 'react';

const Info: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-3xl font-bold text-deep-navy mb-8 text-center">How Purli Works & FAQ</h1>

      <section className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">Welcome to Purli!</h2>
        <p className="mb-4">
          Purli is designed to provide a safer and more focused reading experience by allowing you to upload your own ePub books and apply content filters. Our goal is to help readers, especially younger ones or those sensitive to certain themes, enjoy literature without encountering potentially undesirable content.
        </p>
      </section>

      <section className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">How It Works</h2>
        <ol className="list-decimal list-inside space-y-3">
          <li>
            <strong>Upload Your Book:</strong> You start by uploading your ePub file to your personal Purli library.
          </li>
          <li>
            <strong>Content Analysis (Optional Filtering):</strong> If a content filter is available and active for your account or the specific book, Purli will analyze the text. Our system identifies scenes or passages based on the filter criteria.
          </li>
          <li>
            <strong>Reading Experience:</strong> When you read the book in the Purli e-reader, filtered content is visually obscured or hidden. The original ePub file remains unchanged; we only modify how it's displayed to you within our reader.
          </li>
          <li>
            <strong>Your Library, Your Control:</strong> You manage your own library of uploaded books.
          </li>
        </ol>
      </section>

      <section className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">Supported File Types</h2>
        <p className="mb-2">
          Currently, Purli exclusively supports the <strong>ePub (.epub)</strong> file format.
        </p>
        <p className="mb-2">
          ePub is a widely adopted open standard for digital books, compatible with most e-readers and reading applications. We are exploring support for other formats in the future.
        </p>
        <p>
          If you have books in other formats (like .mobi or .pdf), you can often convert them to ePub using free online tools such as CloudConvert or Calibre.
        </p>
      </section>

      <section className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">Why You Provide Your Own Books</h2>
        <p className="mb-3">
          Purli operates on a model where users upload their own legally acquired ePub files. There are several important reasons for this:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>Copyright and Licensing:</strong> Distributing books directly would require complex licensing agreements with publishers and authors. By using your own files, you are responsible for ensuring you have the right to use them.
          </li>
          <li>
            <strong>Vastness of Libraries:</strong> It would be impossible for us to host and manage every book ever published. Allowing you to upload your own ensures you can use Purli with any ePub book you possess.
          </li>
          <li>
            <strong>Focus on Filtering Technology:</strong> Our primary focus is on providing effective content filtering technology, not on being a book distributor.
          </li>
        </ul>
      </section>

      <section className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">DRM-Free Requirement</h2>
        <p className="mb-3">
          The ePub files you upload to Purli must be <strong>DRM-free</strong>. DRM (Digital Rights Management) is a technology used by some publishers and retailers to restrict how digital content can be used, copied, or shared.
        </p>
        <p className="mb-3">
          Purli needs to access the full content of your ePub files to analyze them for filtering and to display them correctly in our reader. DRM-protected files prevent this access.
        </p>
        <p>
          Many authors and publishers offer DRM-free versions of their books. You can often find DRM-free ePubs from independent bookstores, author websites, or publishers like Tor Books. If your book is DRM-protected, you may need to seek a DRM-free version or use tools to remove DRM for personal use, where legally permissible.
        </p>
      </section>

      <section className="mt-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">Where to Get DRM-Free ePubs</h2>
        <p className="mb-3">
          Finding DRM-free ePubs allows you to fully utilize Purli and enjoy your books without restrictions. Here are some places where you might find them:
        </p>
        <ul className="list-disc list-inside space-y-2 mb-3">
          <li>
            <strong>Publishers Direct:</strong> Some publishers sell DRM-free books directly from their websites. Tor Books (for science fiction and fantasy) is a well-known example.
          </li>
          <li>
            <strong>Author Websites:</strong> Independent authors often sell their books directly, and these are frequently DRM-free.
          </li>
          <li>
            <strong>Ebook Retailers Offering DRM-Free Options:</strong>
            <ul className="list-circle list-inside ml-4 mt-1 space-y-1">
              <li><a href="https://www.ebooks.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ebooks.com</a> - Check their policies, as availability can vary.</li>
              <li>Look for stores that explicitly state they sell DRM-free ePubs.</li>
            </ul>
          </li>
          <li>
            <strong>Project Gutenberg:</strong> Offers over 70,000 free ePubs for books whose U.S. copyright has expired.
          </li>
          <li>
            <strong>Humble Bundle:</strong> Often features DRM-free ebook bundles.
          </li>
          <li>
            <strong>StoryBundle:</strong> Curated, limited-time bundles of DRM-free ebooks.
          </li>
        </ul>
        <p>
          When purchasing, always check the store\'s policy or the book\'s product page to confirm if it\'s DRM-free. Searching for "DRM-free ebooks" along with your preferred genre can also yield good results.
        </p>
      </section>

      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} Purli. All rights reserved.</p>
        <p>Happy Reading!</p>
      </footer>
    </div>
  );
};

export default Info;
