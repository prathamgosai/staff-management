export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Login and register pages render their own full-screen layouts,
  // so the auth layout is a simple pass-through.
  return <>{children}</>;
}
