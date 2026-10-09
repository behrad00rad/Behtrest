import { useState } from "react";

const Cmnt = (D) => {
    const url =window.location.href
    const [show, setshow] = useState("");
    const moment = require('moment')
    // console.log(
    //     (moment("2022-10-05-02-07-50", "YYYY-MM-DD-HH-mm-ss").fromNow()),
    //     moment().format("YYYY-MM-DD-HH-mm-ss")       
    // )
    const HandleClick = (comment) =>{
        console.log(comment)
        fetch("http://127.0.0.1:5000/upload/comment",{
            method:'POST',
            headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                    user_id:D.UID,
                    post_id:D.PID,
                    data:comment,
                    date:moment().format("YYYY-MM-DD-HH-mm-ss")
                })  
        })
        window.location.reload(false);
    }
    let data = D.D
    let cms = D.C
     const notnull = cms[0] !== (404)
    const [Input, setInput] = useState('');    
    
    console.log( ) 
    
    return (
        <div className="flex-col ml-3 sm:w-1/2 flex mb-3 p-5">
        <div className="divider "></div>
        <span>uploaded by <a href={"/"+data.post[0].username} className="text-bold underline ">{data.post[0].username}</a></span>
        
        <span className="text-6xl m-5 static drop-shadow-2xl shadow-black  text-white" id="Title">{ data.post[0].title}</span>
        <span className="text-lg m-5 static drop-shadow-lg shadow-black  text-white" id="Title">{ data.post[0].caption}</span>
        
        <div className="divider "></div>
            <div className="flex bg-[#010101] rounded-xl p-2 ">
                    <a href={"/"+data.post[0].username} className="w-1/3">
                    <div className="flex p-1 bg-[#2b2b2b] rounded-lg">    
                        <img src={data.post[0].pfp} className=" rounded-full mx-2 w-11 h-11"/>
                        <span className="text-center p-2 text-slate-300"> {data.post[0].username}</span>
                    </div>
                    </a>
                <div class="dropdown mx-2">
                <button onClick={(e) => {navigator.clipboard.writeText(url)}} className=" hover:bg-[#1e1e1e]  bg-[#2b2b2b] rounded-md scale-[1.3] p-2 m-[5px]">
                        <svg className="invert" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7zM5.003 8L5 20h10V8H5.003zM9 6h8v10h2V4H9v2z"/></svg>
                </button>
                    <div tabindex="0" class="rounded dropdown-content hover:bg-[#1e1e1e] bg-[#555]  p-2 text-center">
                        <div class="">
                        <span>
                            Link copied
                        </span>
                        </div>
                    </div>
                </div>
                <div className="dropdown dropdown-hover bg-[#2b2b2b] rounded-md">
                    <button className="p-3">
                        <svg className="invert" height="25" width="25" viewBox="0 0 24 24" aria-hidden="true" aria-label="" role="img"><path d="M21 14c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2v-6c0-1.1.9-2 2-2s2 .9 2 2v4h14v-4c0-1.1.9-2 2-2zM8.82 8.84c-.78.78-2.05.79-2.83 0-.78-.78-.79-2.04-.01-2.82L11.99 0l6.02 6.01c.78.78.79 2.05.01 2.83-.78.78-2.05.79-2.83 0l-1.2-1.19v6.18a2 2 0 1 1-4 0V7.66L8.82 8.84z"></path></svg>
                    </button>
                    <div tabindex="0" class="rounded dropdown-content bg-[#555]  p-2 text-center">
                        <div ClassName="flex">
                            <div className="flex">
                            </div>
                            <div className="divider "></div>
                            <div className="flex"></div>
                        </div>
                    </div>
                </div>
                
            </div>
        <div>
            <button onClick={() => {
                if( show == 'hidden'){
                    setshow("")
                } 
                else{
                    setshow('hidden')
                }
            }}
            className={"border-2 border-[#1d1d1d] hover:border-cyan-400 font-bold p-2 my-3 rounded-lg bg-[#0d0d0d]"}>
                {notnull && cms.length +' Comment'+ (cms.length > 1?'s' :'')}
                {!notnull && 'Comment'}
            </button>
        </div>
        <div className={" bg-[#010101] flex-col flex p-3 text-white rounded-lg transition-all "+ show}>
             {notnull&&cms}
             {!notnull &&
             <div className="p-2 bg-zinc-900 rounded m-2 ">
                        <p>there isn't any comment yet :( ...</p>   
             </div>
            } 
             <div className="flex justify-between content-center">
                <textarea value={Input} onInput={e => setInput(e.target.value)}  className=" focus:outline-none focus:border-[#5bffdb] h-2/3 bg-[#09131f] text-sm  rounded p-2 border-2 border-[#3593ff] my-4 w-2/3" type={"text"}></textarea>
                <button onClick={() => HandleClick(Input)} type={"submit"} className="hover:bg-[#1e1e1e] text-sm bg-[#222] rounded-lg p-2 w-1/3 h-2/3 text-center m-4" >Leave a comment!</button>
             </div>
        </div>
    </div>
)
}
export default Cmnt;