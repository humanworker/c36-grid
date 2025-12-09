<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#000000" />
    <link rel="manifest" href="manifest.json" />
    <title>C-36 Grid</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
      
      body {
        font-family: 'Space Mono', monospace;
        background-color: #000;
        color: #eee;
        overscroll-behavior: none;
      }
      
      /* Custom Dither Pattern */
      .bg-dither {
        background-image: radial-gradient(#333 15%, transparent 16%), radial-gradient(#333 15%, transparent 16%);
        background-size: 4px 4px;
        background-position: 0 0, 2px 2px;
      }

      /* Hide Scrollbar */
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
    </style>
  <script type="importmap">
{
  "imports": {
    "path": "https://aistudiocdn.com/path@^0.12.7",
    "vite": "https://aistudiocdn.com/vite@^7.2.6",
    "@vitejs/plugin-react": "https://aistudiocdn.com/@vitejs/plugin-react@^5.1.1",
    "url": "https://aistudiocdn.com/url@^0.11.4",
    "lucide-react": "https://aistudiocdn.com/lucide-react@^0.556.0",
    "react/": "https://aistudiocdn.com/react@^19.2.1/",
    "react": "https://aistudiocdn.com/react@^19.2.1",
    "react-dom/": "https://aistudiocdn.com/react-dom@^19.2.1/"
  }
}
</script>
</head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
  </body>
</html>