import { useState } from "react";
import useFetch from "./fech"
export default function Bin({dataParentToChild})
{   
    let id = dataParentToChild; 
    // console.log(id)//[1,2][Math.round(Math.random())]
    let img = new Image();
    img.src = 'http://127.0.0.1:5000/'+id.url;
    let c = "bg-white rounded-xl w-"+ img.width+" h-"+img.height ; 
    return(
        <div  className={"my-1 p-1 static hover:opacity-60 transition-all object-contain"}>
            
            <a href = {'posts/'+id.post_id} className="flex flex-col" >
                <img src={img.src} className="rounded-2xl" title={img.width+"x"+img.height}/>
                {id && <span className="m-5 static drop-shadow-lg shadow-black  text-white"id="caption">{id.title}</span>}
                
            </a>
            
        </div>
    );
}

