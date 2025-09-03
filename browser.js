import TurboSerial from "./index.js";
if(typeof window != "undefined"){
    window.TurboSerial = TurboSerial;
}else {
    self.TurboSerial = TurboSerial;
}
