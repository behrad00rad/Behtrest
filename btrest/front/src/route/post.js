import { useEffect, useState } from "react";
import { useParams } from "react-router-dom"
import Cookies from "universal-cookie";
import Cmnt from "./comps/comment";


export default function Posts(){
    const moment = require('moment')
    const {status} = useParams();
    const img = new Image();
    const [Data, setData] = useState(); 
    const [Post, setPost] = useState();
    const [Comment, setComment] = useState();
    let cms = [];
    const c =  new Cookies()
    const user_id = c.get('user_id')
    
    
    useEffect(() => {
        LoadData()
    },[])
    const LoadComments = async(cm) =>
    { 
        if (cm.c !== '404'){

            
            for(let i=0;i<cm.c.length;i++)
            {
                // console.log(i)
                // console.log(cm.c[i])
                cms.push(
                    <div className="flex flex-col border-2 border-[#3d3d3d] rounded my-1 hover:border-cyan-500" key = {i}>
                    <a href={"/"+cm.c[i].username}>
                        <div className="flex p-2 justify-between bg-[#0d0f0f] rounded">
                            <div className="flex overflow-clip">
                                <img src={cm.c[i].pfp} className=" rounded-full mx-2 w-11 h-11"/>
                            <span className="text-center p-2 text-slate-300"> {cm.c[i].username}</span>
                            <p className="p-2 ">
                                {cm.c[i].data}
                            </p>
                            </div>
                            <span className="text-2xs opacity-40 p-3">
                                {moment(cm.c[i].date, "YYYY MM DD HH mm ss").fromNow()}
                            </span>
                    </div>
                    </a>
                </div>
            );
            }
        }
        else{
            cms.push(
                    404

                )
        }

    }

    const LoadData = async () =>
    {   
        
        let data = await fetch(("http://127.0.0.1:5000/get_post?id="+status))
        data = await data.json()
        // console.log(data)
        if (data != '404'){
            
            await LoadComments(data)
            await setPost(
                <>
                <div className="sm:w-1/2 w-full justify-start p-1 flex flex-col">
                    <img className="rounded-xl rounded-b-lg object-contain w-full" src={"http://127.0.0.1:5000/"+data.post[0].url}/>
                </div>
                <Cmnt D = {data} C= {cms} UID={user_id} PID={status} L={LoadComments()}/>
                </>
            ) 
        } 
        else{
            // console.log('inja')
            setPost(
                <div className="p-40 flex justify-center text-center content-center w-96 h-96 bg-black">
                    <h2> NOT FOUND</h2>
                </div>
                )

        }

    }
    // console.log(Input)
    return(

        <div className="flex flex-col min-h-screen min-w-screen sm:p-16 p-4 bg-[#1d1d1d]">
                <div className="flex justify-center">
                <div className=" shadow-[0px_0px_16px_4px_#000] rounded-xl justify-start sm:w-10/12 object-contain sm:flex bg-[#121212]">
                       {Post}   
                </div>
                </div>
        </div>
    );
}