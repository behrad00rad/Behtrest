import { useParams} from "react-router-dom";
import useFetch from "./comps/fech";


export default function App(){
    const { status } = useParams();
    const {data,loading,error} = useFetch("http://127.0.0.1:5000/get_home?"+status);
    let f = data == '404';
    return (
        <div className='p-9  bg-black min-h-screen'>
        {
            f &&<h1 className="text-center text-bold ">not found</h1>
        }

        {
        (data&&!f) && 
        (
                <div className="m-5 p-3 flex justify-center content-center">
                    <div className="text-center">
                     <img src={data[0].pfp}  className="rounded-full h-28 w-28 object-cover" alt="profile photo"/>
                     <span className="text-white text-4xl text-bold align-center">{status}</span>
                    </div>
                </div>
                
                )
        }
        {
            loading && 
            <p>loading</p>
        }
        {
            error &&
            <h1>sorry an error</h1>
        }
        </div>
        )
}