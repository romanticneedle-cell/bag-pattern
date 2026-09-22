import { defineConfig } from 'vite';

// GitHub Pages 정적 배포: 저장소 하위 경로 대응을 위해 base 는 상대경로로 둔다.
export default defineConfig({
  base: './',
  test: {
    globals: true,
    environment: 'node',
  },
});
