import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="mx-auto flex min-h-screen max-w-app flex-col items-center justify-center bg-background px-6 text-center">
      <h1 className="text-5xl font-extrabold text-primary">404</h1>
      <p className="mt-2 text-lg font-medium">Page not found</p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
      >
        Back to riders
      </Link>
    </div>
  );
};

export default NotFound;
