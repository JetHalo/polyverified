import NextDocument, { Head, Html, Main, NextScript } from "next/document";

export default class Document extends NextDocument {
  render() {
    return (
      <Html lang="en" className="dark">
        <Head>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
          <link rel="shortcut icon" href="/favicon.svg?v=2" />
          <meta name="theme-color" content="#0D111A" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
