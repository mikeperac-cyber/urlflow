// The application package is CommonJS; load the ESM React plugin dynamically.
module.exports = async () => {
  const { default: react } = await import('@vitejs/plugin-react');
  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
    },
  };
};
