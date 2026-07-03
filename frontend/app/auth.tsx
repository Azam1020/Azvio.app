import { Redirect } from 'expo-router';

// Deep-link landing route for Google auth redirects (session_id is processed
// in AuthContext via getInitialURL / openAuthSessionAsync result).
export default function AuthRedirect() {
  return <Redirect href="/" />;
}
