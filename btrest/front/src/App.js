
import{
  Routes,
  BrowserRouter as Router,
  Route,
  Link,
  Navigate
} from "react-router-dom";
import { useParams } from "react-router-dom";
import Profile from "./route/acc";
import Navv from "./route/comps/navv";
import Home from './route/home';
import Post from './route/post';
import Cookies from 'universal-cookie';
import Login from "./route/login";
import Register from "./route/register";
import PinBuilder from "./route/bin-builder";



export default function App(){ 
  const cookies = new Cookies();
  let auth = (cookies.get('auth') == '1');
  // let auth = 1;
  const { status } = useParams();
  return(  
    <div>
      {auth && <Navv></Navv>}
      <Router>
        <Routes>
          <Route path="/register" element={!auth ? <Register/> : <Navigate to="/" replace />}/>
          <Route path="/login" element={!auth ? <Login/> : <Navigate to="/" replace />}/>
          <Route exact path="/" element = {auth ? <Home/> : <Navigate to="/login" replace />}/>  
          <Route path="/posts/:status" element={auth ? <Post/>  : <Navigate to="/login" replace />}/>
          <Route path="/:status" element={auth ? <Profile/>  : <Navigate to="/login" replace />}/>
          <Route path="/pin-builder" element={auth ? <PinBuilder/>  : <Navigate to="/login" replace />}/>
        </Routes>
      </Router>
      </div>   
   
   ); 
 }