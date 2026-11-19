# Test locations

- Backend regression/security tests: `backend/test/` (Node.js built-in test runner)
- FastAPI/ML tests: `ml-service/tests/` (pytest)
- Frontend: JSX syntax parsing was performed in the build workspace; a Vite production build could not be completed because frontend optional dependencies were missing and package registry installation timed out.

End-to-end, browser, MongoDB tenant-isolation and load tests require a configured staging environment. See `TESTING.md`.
