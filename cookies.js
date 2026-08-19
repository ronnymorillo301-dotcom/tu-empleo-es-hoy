(function () {

    "use strict";

    // ==========================================
    // CONFIGURACIÓN
    // ==========================================

    const COOKIE_NAME = "teh_cookies_aceptadas";

    const COOKIE_DIAS = 365;


    // ==========================================
    // COMPROBAR SI YA ACEPTÓ
    // ==========================================

    function cookiesAceptadas() {

        return localStorage.getItem(
            COOKIE_NAME
        ) === "si";

    }


    // ==========================================
    // CREAR AVISO
    // ==========================================

    function crearAvisoCookies() {

        if (cookiesAceptadas()) {
            return;
        }


        const aviso =
            document.createElement("div");

        aviso.id =
            "avisoCookies";


        aviso.innerHTML = `

            <div class="cookies-contenido">

                <div class="cookies-texto">

                    <strong>
                        🍪 Usamos cookies
                    </strong>

                    <p>
                        TU EMPLEO ES HOY utiliza cookies
                        necesarias para el funcionamiento
                        de la plataforma y para mantener
                        tu sesión.
                    </p>

                    <a
                        href="cookies.html"
                        target="_blank"
                    >
                        Ver Política de Cookies
                    </a>

                </div>


                <div class="cookies-botones">

                    <button
                        id="aceptarCookies"
                        type="button"
                    >
                        Aceptar
                    </button>

                    <button
                        id="rechazarCookies"
                        type="button"
                    >
                        Ahora no
                    </button>

                </div>

            </div>

        `;


        document.body.appendChild(
            aviso
        );


        // ==========================================
        // ACEPTAR
        // ==========================================

        const aceptar =
            document.getElementById(
                "aceptarCookies"
            );


        aceptar.addEventListener(
            "click",
            function () {

                localStorage.setItem(
                    COOKIE_NAME,
                    "si"
                );

                ocultarAviso();

            }
        );


        // ==========================================
        // AHORA NO
        // ==========================================

        const rechazar =
            document.getElementById(
                "rechazarCookies"
            );


        rechazar.addEventListener(
            "click",
            function () {

                ocultarAviso();

            }
        );

    }


    // ==========================================
    // OCULTAR AVISO
    // ==========================================

    function ocultarAviso() {

        const aviso =
            document.getElementById(
                "avisoCookies"
            );


        if (aviso) {

            aviso.remove();

        }

    }


    // ==========================================
    // ESTILOS DEL AVISO
    // ==========================================

    function agregarEstilos() {

        const estilo =
            document.createElement("style");


        estilo.textContent = `

            #avisoCookies {

                position: fixed;

                left: 0;

                right: 0;

                bottom: 0;

                z-index: 99999;

                background: #ffffff;

                border-top: 1px solid #ddd;

                box-shadow:
                    0 -5px 20px
                    rgba(0,0,0,0.15);

                padding: 18px;

            }


            .cookies-contenido {

                width: 100%;

                max-width: 1100px;

                margin: auto;

                display: flex;

                align-items: center;

                justify-content: space-between;

                gap: 20px;

            }


            .cookies-texto {

                flex: 1;

            }


            .cookies-texto strong {

                color: #0b5ed7;

                font-size: 18px;

            }


            .cookies-texto p {

                margin: 8px 0;

                color: #555;

                line-height: 1.5;

            }


            .cookies-texto a {

                color: #0b5ed7;

                font-weight: bold;

                text-decoration: none;

            }


            .cookies-texto a:hover {

                text-decoration: underline;

            }


            .cookies-botones {

                display: flex;

                gap: 10px;

                flex-shrink: 0;

            }


            .cookies-botones button {

                border: none;

                border-radius: 7px;

                padding: 11px 18px;

                font-size: 15px;

                font-weight: bold;

                cursor: pointer;

            }


            #aceptarCookies {

                background: #0b5ed7;

                color: white;

            }


            #aceptarCookies:hover {

                background: #084298;

            }


            #rechazarCookies {

                background: #e9ecef;

                color: #333;

            }


            #rechazarCookies:hover {

                background: #d6d9dc;

            }


            @media (max-width: 700px) {

                .cookies-contenido {

                    flex-direction: column;

                    align-items: stretch;

                }


                .cookies-botones {

                    width: 100%;

                }


                .cookies-botones button {

                    flex: 1;

                }

            }

        `;


        document.head.appendChild(
            estilo
        );

    }


    // ==========================================
    // INICIAR
    // ==========================================

    function iniciarCookies() {

        agregarEstilos();

        crearAvisoCookies();

    }


    if (
        document.readyState === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            iniciarCookies
        );

    } else {

        iniciarCookies();

    }

})();