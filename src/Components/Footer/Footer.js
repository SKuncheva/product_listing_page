import style from "./Footer.module.css";

export const Footer = () => {
  return (
    <footer >
      <section className={style.footerContainer}>
      <div className={style.footerTextContainer}>
        <ul className={style.listContainer}>
          <li> <a href='http://localhost:3000' alt='home' className={style.text}>
            <i className="fas fa-home" /> Home
          </a></li>
          <li>
          <a href='http://localhost:3000' alt='contact' className={style.text}>
            <i className="fas fa-envelope" /> Contact Us</a>
          </li>
          <li><a href='http://localhost:3000' alt='policy' className={style.text}>
            <i className="fas fa-user-shield" /> Privacy Policy</a>
          </li>
        </ul>
      </div>

      <div className={style.footerSocialMedia}>
        <ul className={style.listIcon}>
          <li >
            <a href="https://www.facebook.com/" alt='facebook' className={style.iconElement}>
           <i class="fab fa-facebook-square"></i></a>
          </li>
          <li > <a href="https://www.instagram.com/" alt='instagram' className={style.iconElement}>
            <i class="fab fa-instagram-square"></i></a>
          </li>
          <li ><a href="https://www.youtube.com/" alt='youtube' className={style.iconElement}>
          <i class="fab fa-youtube-square"></i></a>
          </li>
        </ul>
      </div>
      </section>
    </footer>
  );
};
