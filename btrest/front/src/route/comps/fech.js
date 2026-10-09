import { useEffect, useState } from "react";

export default function useFetch(url,par=null){

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);


    useEffect(() => {
      fetch(url,par)
        .then(res =>
          res.json()
          )
        .then(actualData => {
          setData(actualData);
          setError(null);
        })
        .catch((err) => {
          setError(err.message);
          setData(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }, []);

    return {data,loading,error}
}
