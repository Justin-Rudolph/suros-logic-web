import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-4xl font-bold">Suros Logic Systems</h1>
      <p className="mt-4 text-gray-600">
        Automation solutions for contractors and businesses.
      </p>

      <Link
        to="/login"
        className="mt-8 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg"
      >
        Log In
      </Link>
    </div>
  );
}
