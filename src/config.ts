/**
 * Publika Firebase-identifierare för inloggningen, ingen hemlighet: de ligger i varje
 * klient. Tomt projectId betyder att inloggningen inte är konfigurerad (lokal utveckling
 * utan moln går ändå). Projektet beefcake-4865a, skapat 2026-09-04.
 */
export const FIREBASE = {
  apiKey: 'AIzaSyAWsBgwy3f6V4ZRPHEhAZ2Rpp57J-EiGUg',
  // Egen authdomän så Googles inloggningsruta slipper visa projekt-id:t med siffror
  // (Google visar authDomain tills brandingen är verifierad). Kräver att
  // https://beefcake.buildapp.se/__/auth/handler ligger i OAuth-klientens Authorized
  // redirect URIs i Cloud Console OCH att beefcake.buildapp.se ligger i Firebase
  // authorized domains. Saknas någon: 400 redirect_uri_mismatch, ingen kan logga in.
  // Revert: 'beefcake-4865a.firebaseapp.com', ute via Pages på ca 30 s.
  authDomain: 'beefcake.buildapp.se',
  projectId: 'beefcake-4865a'
}
