
import Bin from './comps/bin';
import '../App.css';
import { useEffect, useState } from 'react';
import useFetch from './comps/fech';
// import { useEffectOnce } from './comps/effect';


export default function Home() {


  function wait(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
      currentDate = Date.now();
    } while (currentDate - date < milliseconds);
  }


  
  useEffect(() =>{
    loadFeed()
    window.addEventListener('scroll',handleScroll)
  },[])
  
  const [posts, setPosts] = useState([]);
  const [data,setdata] = useState({});
  let newP = []
  let url = 'http://127.0.0.1:5000/get_feed'
  

  async function loadFeed(){
    let data = await fetch(url)
    data = await data.json()
    // await console.log(data.posts)

    for(let i=0;i<data.posts.length;i++)
    {
      await newP.push(<Bin dataParentToChild = {data.posts[i]} key={i}/>);
    }

    setPosts((oldP) => [...oldP,...newP]);
  }


  async function loadpost(data){
      { 
        let data = await fetch(url)
        data = await data.json()
        await console.log(data.posts)
      for(let i=0;i<data.posts.length;i++)
      {
        await newP.push(<Bin dataParentToChild = {data.posts[i]} key={i}/>);
      }
      setPosts((oldP) => [...oldP,...newP]);
      }
  }
 
    
    
    const handleScroll = (e) => {
        if (window.innerHeight + e.target.documentElement.scrollTop +2 > 
          e.target.documentElement.scrollHeight)
          {
            loadpost();
          }
        }
        
        
return(
  <div>
      {data&&
      <div className='xl:columns-5 md:columns-4 sm:columns-3 columns-2 p-8 px-4 bg-zinc-900 min-w-full min-h-screen'>
        {posts}
      </div>}
      <div className='min-w-full bg-black text-center'>
        <p>lollll</p>
      </div>
    </div>
  );
}

 