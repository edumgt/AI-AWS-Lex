/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        pretendard: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Helvetica Neue',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'sans-serif'
        ]
      },
      colors: {
        academy: {
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          accent: '#06b6d4',
          dark: '#1e293b',
          light: '#f1f5f9'
        }
      }
    }
  },
  plugins: []
};
