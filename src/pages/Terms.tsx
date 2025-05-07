const Terms = () => {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="text-3xl font-bold text-deep-navy mb-8 text-center">Terms & Privacy</h1>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">Terms & Conditions</h2>
        <p className="mb-4">
          By accessing or using Purli, you agree to be bound by these Terms and Conditions. We reserve the right to update or modify these terms at any time. Continued use of the platform after changes constitutes acceptance of those changes.
        </p>
        <p className="mb-4">
          You must be 13 years or older to use this service. All content uploaded to Purli must comply with applicable copyright laws. We reserve the right to remove any content that violates our policies or applicable law.
        </p>
        <p>
          Purli is offered "as-is" with no warranty or guarantee of availability. We may change or suspend parts of the service at any time.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-deep-navy mb-4">Privacy Policy</h2>
        <p className="mb-4">
          We take your privacy seriously. When you sign up for Purli, we collect only the data necessary to operate our service, such as your email and saved books.
        </p>
        <p className="mb-4">
          We do not sell your personal data. Your reading activity and content filters are kept private and are only used to improve your experience.
        </p>
        <p>
          If you have any questions about how your data is used, feel free to contact us at <a href="mailto:hello@purlibooks.com" className="text-deep-navy underline">hello@purlibooks.com</a>.
        </p>
      </section>
    </div>
  );
};

export default Terms;
