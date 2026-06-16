/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Event production dark aesthetic palette
        brand: {
          red: '#ff3b30',
          yellow: '#ffcc00',
          green: '#34c759',
          blue: '#007aff',
        },
        bg: {
          darkest: '#09090b',
          darker: '#121214',
          dark: '#1e1e24',
          light: '#2a2a32',
        },
        accent: {
          live: '#ef4444',
          preview: '#3b82f6',
          safe: '#10b981',
        }
      },
    },
  },
  plugins: [],
}
