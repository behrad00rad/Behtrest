import React, { useEffect, useState } from 'react'
import Cookies from 'universal-cookie';
function Navv()
{   
    const [username, setusername] = useState('');
    const cookies = new Cookies();
    const [C,setC] = useState("sticky top-0 z-50 bg-zinc-900 min-w-screen p-1 flex flex-row justify-between");
    fetch("http://127.0.0.1:5000/ToUser?"+cookies.get('user_id')).then(r=>r.json()).then(data=>data[0].username).then(r => setusername(r))
    const handleScroll = (e) =>{
        if (e.target.documentElement.scrollTop>150)
            {
               setC("shadow-black shadow-lg sticky top-0 z-50 bg-[#1d1d1d] min-w-screen p-1 flex flex-row justify-between object-cover ");
            
            }
        else{
                setC("sticky top-0 z-50 bg-[#1d1d1d] w-full p-1 flex flex-row justify-between object-cover ")
        }
        }
        useEffect(() =>{
            window.addEventListener('scroll',handleScroll)
        },[])        

    return(
        <nav className={C}>
            <div id="first-p" className="flex">  
                 <div className=" min-w-max rounded-full text-white text-center p-2 hue-rotate-30" id="pin">
                    <a href="/">
                    <img src="http://127.0.0.1:5000/get_image?id=logo" className="-hue-rotate-180 h-11 content-center drop-shadow-md border-4 border-stone-300 rounded-full"/>
                    </a>
                </div>
                 <a href='/'>
                    <div className=" bg-black cursor-pointer font-medium text-lg m-2 p-3 md:rounded-full  rounded-lg text-white text-center " id="home">
                        <span>home</span>
                    </div>
                 </a>
                <div className="no md:visible dropdown  content-center justify-center text-center p-4">
                 <label tabIndex="0" className=" cursor-pointer text-white text-center text-xl m-1">Create</label>
                 <ul tabIndex="0" className=" menu dropdown-content p-2 m-4 shadow-md bg-zinc-800 rounded-2xl w-52">
                        <li><a href='/pin-builder/'>Create</a></li>
                 </ul>
                </div>
            </div>
            <div className="m-2 w-full h-11">
             <input type="text" id="searchbar" className="h-12 w-full  outline-none rounded-full px-11 transition-transform hover:border-2 focus:border-2 border-cyan-500 focus:bg-zinc-900 bg-slate-800 text-white"/>
             <svg className="invert relative bottom-9 left-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M18.031 16.61l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z"/></svg>
             </div>
            <div id="sec-p" className="flex">
                 <div className=" bg-zinc-700 transition-all content-center p-3 w-12 h-12 m-2 rounded-full" id="profile">
                    <svg className="invert" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                    <path fill="none" d="M0 0h24v24H0z"/>
                    <path d="M20 18.667l.4.533a.5.5 0 0 1-.4.8H4a.5.5 0 0 1-.4-.8l.4-.533V10a8 8 0 1 1 16 0v8.667zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>
                    </svg>
                    </div>
                 <div className=" p-3 justify-center hover:bg-zinc-700 w-12 h-12 m-2 rounded-full transition-all" id="profile">
                 <svg className="invert" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                    <path fill="none" d="M0 0h24v24H0z"/>
                    <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm-.692-2H20V5H4v13.385L5.763 17zM11 10h2v2h-2v-2zm-4 0h2v2H7v-2zm8 0h2v2h-2v-2z"/>
                 </svg>
                 </div>
                 <a href={'/'+username}>
                    <div className=" p-3 hover:bg-zinc-700 w-12 h-12 m-2 rounded-full transition-all" id="profile">
                        <svg className="invert" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                            <path fill="none" d="M0 0h24v24H0z"/>
                            <path d="M20 22h-2v-2a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v2H4v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2zm-8-9a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                        </svg>
                    </div>
                 </a>

            </div>
        </nav>
    );
}

export default Navv ;