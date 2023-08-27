import img from "./image/sneaker.png";
import background from "./image/Background.jpg";
import style from "./Banner.module.css";

export const Banner = () => {
  return (
    <>
      <section className='containerBanner'>
        <div className={style.wrapper}>
          {/* ------------------------- Background image-------------------*/}
          <div className={style.background}>
            <img src={background} alt="background" className={style.img}/>
          </div>
          {/* -----------------------Elements------------------------------ */}
          <div className={style.elements}>
          <div className="text">
              <p className={style.paragraph}>
                Effortlessly combine the best of function and fashion for
                greatness in every step
              </p>
            </div>
            <div className="image">
              <img src={img} alt="sneaker" className={style.image}/>
            </div>
           
          </div>
        </div>
      </section>
    </>
  );
};
